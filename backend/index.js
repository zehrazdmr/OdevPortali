require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Op } = require('sequelize');
const { sequelize, connectDB } = require('./db');
const {
  User,
  Submission,
  Criterion,
  Grade,
  AllowedStudent,
  Settings,
  Course,
} = require('./models');
const { hashPassword, verifyPassword, needsPasswordRehash } = require('./src/auth');

const app = express();
app.use(cors());
app.use(express.json());

const parseDersler = (val) => {
  if (Array.isArray(val)) return [...new Set(val.map(String).map(s => s.trim()).filter(Boolean))];
  if (typeof val === 'string') return [...new Set(val.split(',').map(s => s.trim()).filter(Boolean))];
  return [];
};

const hasCourseAccess = (authorizedCourses, courseCode) => {
  if (!courseCode) return true;
  return authorizedCourses.includes(String(courseCode).trim());
};

const normNo = (v) => String(v || '').trim();
const normName = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const normNameLC = (v) => normName(v).toLocaleLowerCase('tr-TR');

const getVideoLimitKey = (dersKodu) =>
  dersKodu ? `video_limit:${String(dersKodu).trim()}` : 'video_limit';

const DEFAULT_LIMIT = 3;

const getEvaluationLimit = async (dersKodu) => {
  const key = getVideoLimitKey(dersKodu);
  const rows = await Settings.findAll({
    where: { key: { [Op.in]: [key, 'video_limit'] } },
    order: [['key', 'ASC']],
  });
  const row = rows.find(r => r.key === key) || rows.find(r => r.key === 'video_limit');
  const n = Number(row?.value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_LIMIT;
};

const isAdminUser = async (user) => {
  if (!user || user.rol !== 'hoca') return false;
  if (user.is_admin) return true;
  const first = await User.findOne({ where: { rol: 'hoca' }, order: [['id', 'ASC']] });
  return !!first && first.id === user.id;
};

const weightedAvg = (grades) => {
  const totals = grades.reduce((acc, g) => {
    const p = Number(g.puan), m = Number(g.criterion?.max_puan ?? g.max_puan);
    if (!Number.isFinite(p) || !Number.isFinite(m) || m <= 0) return acc;
    acc.sum += p;
    acc.max += m;
    return acc;
  }, { sum: 0, max: 0 });
  return totals.max ? (totals.sum / totals.max) * 100 : null;
};

const adminKontrol = async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Yetkilendirme bilgisi eksik.' });

    const user = await User.findByPk(parseInt(userId, 10));
    if (!user || user.rol !== 'hoca') return res.status(403).json({ error: 'Bu işlem için hoca yetkisi gerekiyor.' });

    req.currentUser = user;
    req.isAdmin = await isAdminUser(user);
    if (req.isAdmin) {
      const courses = await Course.findAll({ attributes: ['ders_kodu'] });
      req.authorizedCourses = courses.map(c => c.ders_kodu);
    } else {
      req.authorizedCourses = parseDersler(user.authorized_course);
    }
    next();
  } catch (err) {
    console.error('adminKontrol:', err);
    res.status(500).json({ error: 'Yetki kontrolü yapılamadı.' });
  }
};

app.post('/api/auth/register', async (req, res) => {
  const { ogrenci_no, ad_soyad, sifre, secilenDersler } = req.body;
  const no = normNo(ogrenci_no);
  const isim = normName(ad_soyad);
  try {
    const allowed = await AllowedStudent.findOne({ where: { ogrenci_no: no } });
    if (!allowed) return res.status(403).json({ error: 'Öğrenci numaranız sistemde tanımlı değil. Lütfen hocanızla iletişime geçin.' });
    if (normNameLC(allowed.ad_soyad) !== normNameLC(isim)) return res.status(403).json({ error: 'Ad soyad bilgisi kayıtla eşleşmiyor.' });

    const existing = await User.findOne({ where: { ogrenci_no: no } });
    if (existing) return res.status(409).json({ error: 'Bu öğrenci numarasıyla zaten kayıt olunmuş.' });

    const izinliDersler = parseDersler(allowed.dersler);
    const yetkisiz = (secilenDersler || []).find(d => !izinliDersler.includes(d));
    if (yetkisiz) return res.status(403).json({ error: `${yetkisiz} dersini almaya yetkiniz görünmüyor.` });

    const hashedSifre = await hashPassword(sifre);
    await User.create({ ogrenci_no: no, ad_soyad: isim, sifre: hashedSifre, rol: 'ogrenci' });
    res.json({ message: 'Kayıt başarılı' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kayıt hatası' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { ogrenci_no, sifre } = req.body;
  const no = normNo(ogrenci_no);
  try {
    const user = await User.findOne({ where: { ogrenci_no: no } });
    if (!user || !(await verifyPassword(sifre, user.sifre))) {
      return res.status(401).json({ error: 'Hatalı kullanıcı adı veya şifre!' });
    }

    if (needsPasswordRehash(user.sifre)) {
      await user.update({ sifre: await hashPassword(sifre) });
    }

    let dersler = [];
    if (user.rol === 'ogrenci') {
      const allowed = await AllowedStudent.findOne({ where: { ogrenci_no: no } });
      dersler = allowed ? parseDersler(allowed.dersler) : [];
    } else {
      dersler = parseDersler(user.authorized_course);
    }

    res.json({
      message: 'Giriş başarılı',
      user: {
        id: user.id,
        ad_soyad: user.ad_soyad,
        ogrenci_no: user.ogrenci_no,
        rol: user.rol,
        is_admin: await isAdminUser(user),
        dersler,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/api/admin/upload-students', adminKontrol, async (req, res) => {
  const { students, secilenDers } = req.body;
  if (!hasCourseAccess(req.authorizedCourses, secilenDers)) {
    return res.status(403).json({ error: 'Bu ders için yetkiniz yok.' });
  }
  try {
    const rows = (students || []).slice(2);
    for (const s of rows) {
      const no = normNo(s['__EMPTY']);
      const isim = normName(s['__EMPTY_1']);
      if (!no || no === 'Öğrenci No') continue;

      const existing = await AllowedStudent.findOne({ where: { ogrenci_no: no } });
      if (existing) {
        const dersler = parseDersler(existing.dersler);
        if (!dersler.includes(secilenDers)) dersler.push(secilenDers);
        await existing.update({ dersler: dersler.join(','), ad_soyad: existing.ad_soyad || isim });
      } else {
        await AllowedStudent.create({ ogrenci_no: no, ad_soyad: isim, dersler: secilenDers });
      }
    }
    res.json({ message: 'Öğrenciler başarıyla listeye eklendi!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Veritabanına kaydedilirken hata oluştu.' });
  }
});

app.get('/api/courses', async (req, res) => {
  try {
    const courses = await Course.findAll({ order: [['ders_adi', 'ASC']] });
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: 'Dersler yüklenemedi.' });
  }
});

app.post('/api/courses', adminKontrol, async (req, res) => {
  const { ders_kodu, ders_adi, aciklama } = req.body;
  if (!ders_kodu || !ders_adi) return res.status(400).json({ error: 'Ders kodu ve adı gereklidir.' });
  try {
    const existing = await Course.findOne({ where: { ders_kodu } });
    if (existing) return res.status(400).json({ error: 'Bu ders kodu zaten mevcut.' });
    const course = await Course.create({ ders_kodu, ders_adi, aciklama: aciklama || '' });
    res.status(201).json(course);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ders eklenemedi.' });
  }
});

app.delete('/api/courses/:dersKodu', adminKontrol, async (req, res) => {
  const { dersKodu } = req.params;
  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) return res.status(403).json({ error: 'Bu ders için yetkiniz yok.' });
  try {
    await Criterion.destroy({ where: { ders_kodu: dersKodu } });
    await Course.destroy({ where: { ders_kodu: dersKodu } });
    res.json({ message: 'Ders silindi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ders silinemedi.' });
  }
});

app.get('/api/criteria/:dersKodu', async (req, res) => {
  try {
    const criteria = await Criterion.findAll({
      where: { ders_kodu: req.params.dersKodu },
      order: [['id', 'ASC']],
    });
    res.json(criteria);
  } catch (err) {
    res.status(500).json({ error: 'Kriterler yüklenemedi.' });
  }
});

app.post('/api/criteria', adminKontrol, async (req, res) => {
  const { kriter_adi, max_puan, ders_kodu } = req.body;
  if (!hasCourseAccess(req.authorizedCourses, ders_kodu)) return res.status(403).json({ error: 'Bu ders için yetkiniz yok.' });
  try {
    const criterion = await Criterion.create({
      kriter_adi,
      max_puan: parseInt(max_puan, 10) || 100,
      ders_kodu,
    });
    res.json(criterion);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kriter eklenemedi.' });
  }
});

app.post('/api/submissions', async (req, res) => {
  const { userId, video_url, ders_kodu, proje_aciklamasi } = req.body;
  if (!userId || !video_url || !ders_kodu) return res.status(400).json({ error: 'UserId, video_url ve ders_kodu gereklidir.' });
  try {
    const existing = await Submission.findOne({ where: { userId: parseInt(userId, 10), ders_kodu } });
    if (existing) return res.status(400).json({ error: 'Bu ders için zaten bir video yüklediniz.' });

    await Submission.create({
      userId: parseInt(userId, 10),
      video_url,
      ders_kodu,
      proje_aciklamasi: proje_aciklamasi || '',
    });
    res.json({ message: 'Videonuz başarıyla yüklendi!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Video yüklenirken hata oluştu.' });
  }
});

app.get('/api/assign-video/:userId/:dersKodu', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const { dersKodu } = req.params;
  try {
    const limit = await getEvaluationLimit(dersKodu);
    const gradedSubs = await Grade.findAll({
      where: { puan_veren_id: userId },
      include: [{
        model: Submission,
        as: 'submission',
        where: { ders_kodu: dersKodu },
        attributes: [],
      }],
      attributes: ['submissionId'],
    });
    const gradedIds = [...new Set(gradedSubs.map(g => g.submissionId))];
    if (gradedIds.length >= limit) {
      return res.status(403).json({ error: `Bu ders için en fazla ${limit} video değerlendirebilirsiniz.`, limitReached: true, evaluationLimit: limit });
    }

    const eligible = await Submission.findAll({
      where: {
        ders_kodu: dersKodu,
        userId: { [Op.ne]: userId },
        ...(gradedIds.length ? { id: { [Op.notIn]: gradedIds } } : {}),
      },
      include: [{ model: User, as: 'user', attributes: ['ad_soyad', 'id'] }],
    });

    if (!eligible.length) {
      const all = await Submission.findAll({
        where: { ders_kodu: dersKodu, userId: { [Op.ne]: userId } },
        include: [{ model: User, as: 'user', attributes: ['ad_soyad', 'id'] }],
      });
      if (!all.length) return res.status(404).json({ error: 'Puanlanacak video kalmadı.' });
      return res.json(all[Math.floor(Math.random() * all.length)]);
    }

    res.json(eligible[Math.floor(Math.random() * eligible.length)]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Video atama hatası.' });
  }
});

app.get('/api/can-evaluate/:userId/:dersKodu', async (req, res) => {
  const { userId, dersKodu } = req.params;
  const sub = await Submission.findOne({ where: { userId: parseInt(userId, 10), ders_kodu: dersKodu } });
  if (!sub) return res.json({ canEvaluate: false, message: 'Başkalarını puanlayabilmek için önce kendi projenizi yüklemelisiniz!' });
  res.json({ canEvaluate: true });
});

app.get('/api/check-submission-status', async (req, res) => {
  const { userId, dersKodu } = req.query;
  const sub = await Submission.findOne({ where: { userId: parseInt(userId, 10), ders_kodu: dersKodu } });
  res.json({ hasUploaded: !!sub });
});

app.post('/api/grades', async (req, res) => {
  const { submissionId, userId, scores, puanlananOgrenciId } = req.body;
  try {
    const submission = await Submission.findByPk(parseInt(submissionId, 10));
    if (!submission) return res.status(404).json({ error: 'Submission bulunamadı.' });
    if (!Array.isArray(scores) || !scores.length) return res.status(400).json({ error: 'En az bir kriter puanı gereklidir.' });

    const limit = await getEvaluationLimit(submission.ders_kodu);
    const gradedSubs = await Grade.findAll({
      where: { puan_veren_id: parseInt(userId, 10) },
      include: [{
        model: Submission,
        as: 'submission',
        where: { ders_kodu: submission.ders_kodu },
        attributes: [],
      }],
      attributes: ['submissionId'],
    });
    const alreadyGradedThisSub = await Grade.findOne({
      where: { submissionId: parseInt(submissionId, 10), puan_veren_id: parseInt(userId, 10) },
    });
    if (gradedSubs.length >= limit && !alreadyGradedThisSub) {
      return res.status(403).json({ error: `Bu ders için en fazla ${limit} video değerlendirebilirsiniz.` });
    }

    const criterionIds = [...new Set(scores.map(s => parseInt(s.criterionId, 10)))];
    const validCriteria = await Criterion.findAll({
      where: { id: { [Op.in]: criterionIds }, ders_kodu: submission.ders_kodu },
    });
    if (validCriteria.length !== criterionIds.length) return res.status(400).json({ error: 'Geçersiz kriter puanı gönderildi.' });

    const criterionMap = new Map(validCriteria.map(c => [c.id, c]));
    for (const score of scores) {
      const cId = parseInt(score.criterionId, 10);
      const puan = parseInt(score.puan, 10);
      const criterion = criterionMap.get(cId);
      if (!criterion) throw new Error('Geçersiz kriter.');
      if (!Number.isInteger(puan) || puan < criterion.min_puan || puan > criterion.max_puan) {
        throw new Error(`${criterion.kriter_adi} için geçerli aralık: ${criterion.min_puan}-${criterion.max_puan}.`);
      }

      const existing = await Grade.findOne({
        where: {
          submissionId: parseInt(submissionId, 10),
          puan_veren_id: parseInt(userId, 10),
          criterionId: cId,
        },
      });

      if (existing) {
        await existing.update({ puan });
      } else {
        await Grade.create({
          submissionId: parseInt(submissionId, 10),
          puan_veren_id: parseInt(userId, 10),
          criterionId: cId,
          puan,
          puanlanan_ogrenci_id: parseInt(puanlananOgrenciId, 10),
        });
      }
    }

    res.json({ message: 'Kaydedildi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Hata.' });
  }
});

app.get('/api/admin/submissions/:dersKodu', adminKontrol, async (req, res) => {
  const { dersKodu } = req.params;
  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) return res.status(403).json({ error: 'Bu ders bilgilerine erişemezsiniz.' });
  try {
    const subs = await Submission.findAll({
      where: { ders_kodu: dersKodu },
      include: [
        { model: User, as: 'user', attributes: ['ad_soyad', 'ogrenci_no'] },
        { model: Grade, as: 'grades', attributes: ['puan'] },
      ],
    });
    res.json(subs.map(s => ({
      ...s.toJSON(),
      User: { ad_soyad: s.user.ad_soyad, ogrenci_no: s.user.ogrenci_no },
      ortalama_puan: s.grades.length ? s.grades.reduce((a, g) => a + g.puan, 0) / s.grades.length : null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Veriler çekilemedi.' });
  }
});

app.get('/api/admin/submission-detail/:submissionId', adminKontrol, async (req, res) => {
  const subId = parseInt(req.params.submissionId, 10);
  try {
    const submission = await Submission.findByPk(subId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'ad_soyad', 'ogrenci_no'] },
        {
          model: Grade,
          as: 'grades',
          include: [
            { model: Criterion, as: 'criterion', attributes: ['id', 'kriter_adi', 'max_puan'] },
            { model: User, as: 'puanVeren', attributes: ['id', 'ad_soyad', 'rol'] },
          ],
        },
      ],
    });
    if (!submission) return res.status(404).json({ error: 'Submission bulunamadı.' });
    if (!req.isAdmin && !hasCourseAccess(req.authorizedCourses, submission.ders_kodu)) {
      return res.status(403).json({ error: 'Bu ders için yetkiniz yok.' });
    }

    const criterias = await Criterion.findAll({ where: { ders_kodu: submission.ders_kodu } });
    const hocaPuanlari = [];
    const akranPuanlari = [];
    const alinanHoca = [];
    const alinanAkran = [];
    const alinanTum = [];

    for (const g of submission.grades) {
      const kayit = {
        id: g.id,
        criterionId: g.criterion?.id,
        puan: g.puan,
        kriter_adi: g.criterion?.kriter_adi,
        max_puan: g.criterion?.max_puan,
        veren: g.puanVeren?.ad_soyad,
        verenRol: g.puanVeren?.rol || 'ogrenci',
      };
      alinanTum.push(kayit);
      if (g.puanVeren?.rol === 'hoca') {
        hocaPuanlari.push(kayit);
        alinanHoca.push(kayit);
      } else {
        akranPuanlari.push(kayit);
        alinanAkran.push(kayit);
      }
    }

    const verilenGrades = await Grade.findAll({
      where: { puan_veren_id: submission.userId },
      include: [
        { model: Criterion, as: 'criterion', attributes: ['kriter_adi', 'max_puan'] },
        {
          model: Submission,
          as: 'submission',
          where: { ders_kodu: submission.ders_kodu },
          include: [{ model: User, as: 'user', attributes: ['ad_soyad', 'ogrenci_no'] }],
        },
      ],
    });

    const ogrenciVerdigiPuanlar = verilenGrades
      .filter(g => g.submission?.userId !== submission.userId)
      .map(g => ({
        id: g.id,
        puan: g.puan,
        kriter_adi: g.criterion?.kriter_adi,
        max_puan: g.criterion?.max_puan,
        puanlananOgrenci: g.submission?.user?.ad_soyad,
        puanlananOgrenciNo: g.submission?.user?.ogrenci_no,
        submissionId: g.submissionId,
      }));

    res.json({
      id: submission.id,
      video_url: submission.video_url,
      proje_aciklamasi: submission.proje_aciklamasi,
      ders_kodu: submission.ders_kodu,
      hoca_genel_puani: weightedAvg(alinanHoca.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
      criterias,
      student: submission.user,
      hocaPuanlari,
      akranPuanlari,
      alinanHocaPuanlari: alinanHoca,
      alinanAkranPuanlari: alinanAkran,
      alinanTumPuanlar: alinanTum,
      ogrenciVerdigiPuanlar,
      istatistikler: {
        hocaGenelPuani: weightedAvg(alinanHoca.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
        alinanHocaOrtalamasi: weightedAvg(alinanHoca.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
        alinanAkranOrtalamasi: weightedAvg(alinanAkran.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
        alinanGenelOrtalama: weightedAvg(alinanTum.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
        verdigiOrtalama: weightedAvg(ogrenciVerdigiPuanlar.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Detay bilgisi çekilemedi.' });
  }
});

app.post('/api/admin/grade-submission', adminKontrol, async (req, res) => {
  const { submissionId, puan } = req.body;
  try {
    const sub = await Submission.findByPk(parseInt(submissionId, 10));
    if (!sub) return res.status(404).json({ error: 'Submission bulunamadı.' });
    if (!hasCourseAccess(req.authorizedCourses, sub.ders_kodu)) return res.status(403).json({ error: 'Bu ders için yetkiniz yok.' });
    await sub.update({ hoca_puani: parseInt(puan, 10) });
    res.json({ message: 'Hoca puanı kaydedildi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Hata.' });
  }
});

app.get('/api/admin/all-students-status/:dersKodu', adminKontrol, async (req, res) => {
  const { dersKodu } = req.params;
  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) return res.status(403).json({ error: 'Bu ders bilgilerine erişemezsiniz.' });
  try {
    const allowedAll = await AllowedStudent.findAll({ where: { dersler: { [Op.like]: `%${dersKodu}%` } } });
    const allowed = allowedAll.filter(s => parseDersler(s.dersler).includes(dersKodu));
    const nos = allowed.map(s => s.ogrenci_no);

    const users = await User.findAll({ where: { ogrenci_no: { [Op.in]: nos } } });
    const userMap = new Map(users.map(u => [u.ogrenci_no, u]));
    const userIds = users.map(u => u.id);

    const submissions = await Submission.findAll({ where: { userId: { [Op.in]: userIds }, ders_kodu: dersKodu } });
    const subMap = new Map(submissions.map(s => [s.userId, s]));
    const subIds = submissions.map(s => s.id);

    const grades = subIds.length ? await Grade.findAll({
      where: { submissionId: { [Op.in]: subIds } },
      include: [
        { model: Criterion, as: 'criterion', attributes: ['max_puan'] },
        { model: User, as: 'puanVeren', attributes: ['rol'] },
      ],
    }) : [];

    const givenGrades = userIds.length ? await Grade.findAll({
      where: { puan_veren_id: { [Op.in]: userIds } },
      include: [
        { model: Submission, as: 'submission', include: [{ model: User, as: 'user', attributes: ['id'] }] },
        { model: Criterion, as: 'criterion', attributes: ['max_puan'] },
      ],
    }) : [];

    const receivedBySubId = {};
    const hocaBySubId = {};
    grades.forEach(g => {
      const k = g.submissionId;
      if (!receivedBySubId[k]) receivedBySubId[k] = [];
      receivedBySubId[k].push(g);
      if (g.puanVeren?.rol === 'hoca') {
        if (!hocaBySubId[k]) hocaBySubId[k] = [];
        hocaBySubId[k].push(g);
      }
    });

    const givenByUserId = {};
    givenGrades.filter(g => g.submission?.userId !== g.puan_veren_id).forEach(g => {
      const k = g.puan_veren_id;
      if (!givenByUserId[k]) givenByUserId[k] = [];
      givenByUserId[k].push(g);
    });

    const result = allowed.map(s => {
      const user = userMap.get(s.ogrenci_no);
      const sub = user ? subMap.get(user.id) : null;
      const safeUser = user ? (({ sifre, ...rest }) => rest)(user.toJSON()) : null;
      return {
        ...s.toJSON(),
        RegisteredUser: safeUser ? { ...safeUser, Submissions: sub ? [sub] : [] } : null,
        alinan_ortalama: sub ? weightedAvg((receivedBySubId[sub.id] || []).map(g => ({ puan: g.puan, criterion: g.criterion }))) : null,
        verdigi_ortalama: user ? weightedAvg((givenByUserId[user.id] || []).map(g => ({ puan: g.puan, criterion: g.criterion }))) : null,
        hoca_genel_puani: sub ? weightedAvg((hocaBySubId[sub.id] || []).map(g => ({ puan: g.puan, criterion: g.criterion }))) : null,
      };
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Liste çekilirken hata oluştu.' });
  }
});

app.get('/api/admin/instructors', adminKontrol, async (req, res) => {
  try {
    const instructors = await User.findAll({
      where: { rol: 'hoca' },
      attributes: ['id', 'ogrenci_no', 'ad_soyad', 'authorized_course'],
    });
    res.json(instructors.map(i => ({ ...i.toJSON(), authorized_courses: parseDersler(i.authorized_course) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Hocalar çekilemedi.' });
  }
});

app.post('/api/admin/instructors', adminKontrol, async (req, res) => {
  const { ogrenci_no, ad_soyad, sifre } = req.body;
  const dersler = parseDersler(req.body.authorized_courses || req.body.authorized_course);
  if (!ogrenci_no || !ad_soyad || !sifre || !dersler.length) return res.status(400).json({ error: 'Tüm alanlar zorunludur.' });
  try {
    const existing = await User.findOne({ where: { ogrenci_no } });
    if (existing) return res.status(400).json({ error: 'Bu numarada kullanıcı zaten mevcut.' });
    const validCourses = await Course.count({ where: { ders_kodu: { [Op.in]: dersler } } });
    if (validCourses !== dersler.length) return res.status(400).json({ error: 'Seçilen ders mevcut değil.' });
    const hashedSifre = await hashPassword(sifre);
    const hoca = await User.create({
      ogrenci_no,
      ad_soyad,
      sifre: hashedSifre,
      rol: 'hoca',
      authorized_course: dersler.join(','),
    });
    res.status(201).json({ id: hoca.id, ogrenci_no, ad_soyad, authorized_course: hoca.authorized_course, authorized_courses: dersler });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Hoca eklenemedi.' });
  }
});

app.delete('/api/admin/instructors/:id', adminKontrol, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Hoca silme yetkisi sadece admin hocadadır.' });
  try {
    const hoca = await User.findOne({ where: { id: parseInt(req.params.id, 10), rol: 'hoca' } });
    if (!hoca) return res.status(404).json({ error: 'Hoca bulunamadı.' });
    await hoca.destroy();
    res.json({ message: 'Hoca silindi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Hoca silinemedi.' });
  }
});

app.get('/api/settings/video_limit', adminKontrol, async (req, res) => {
  const dersKodu = String(req.query.dersKodu || '').trim();
  if (!dersKodu) return res.status(400).json({ error: 'dersKodu zorunludur.' });
  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) return res.status(403).json({ error: 'Bu ders ayarına erişemezsiniz.' });
  const setting = await Settings.findOne({ where: { key: getVideoLimitKey(dersKodu) } });
  res.json({ value: setting?.value ?? '3' });
});

app.post('/api/settings/update-limit', adminKontrol, async (req, res) => {
  const limit = Number(req.body?.limit);
  const dersKodu = String(req.body?.dersKodu || '').trim();
  if (!Number.isInteger(limit) || limit <= 0) return res.status(400).json({ error: 'Geçerli bir limit değeri gönderin.' });
  if (!dersKodu) return res.status(400).json({ error: 'dersKodu zorunludur.' });
  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) return res.status(403).json({ error: 'Bu ders ayarını güncelleyemezsiniz.' });
  const key = getVideoLimitKey(dersKodu);
  await Settings.upsert({ key, value: String(limit) });
  res.json({ success: true, message: 'Limit başarıyla güncellendi!' });
});

const PORT = process.env.PORT || 5002;

const startServer = async () => {
  try {
    await connectDB();
    await sequelize.sync({ alter: true });
    app.listen(PORT, () => console.log(`📡 Sunucu çalışıyor: ${PORT}`));
  } catch (err) {
    console.error('Sunucu başlatılamadı:', err);
    process.exit(1);
  }
};

startServer();
