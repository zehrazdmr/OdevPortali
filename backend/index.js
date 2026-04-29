require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize, connectDB } = require('./db');
require('./models');
//const prisma = require('./src/prisma');
const { hashPassword, verifyPassword, needsRehash } = require('./src/auth');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

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
  const row = await prisma.setting.findFirst({
    where: { key: { in: [key, 'video_limit'] } },
    orderBy: { key: 'asc' },
  });
  const n = Number(row?.value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_LIMIT;
};

const isAdminUser = async (user) => {
  if (!user || user.rol !== 'hoca') return false;
  if (user.is_admin) return true;
  const first = await prisma.user.findFirst({ where: { rol: 'hoca' }, orderBy: { id: 'asc' } });
  return !!first && first.id === user.id;
};

const weightedAvg = (grades) => {
  const totals = grades.reduce((acc, g) => {
    const p = Number(g.puan), m = Number(g.criterion?.max_puan ?? g.max_puan);
    if (!Number.isFinite(p) || !Number.isFinite(m) || m <= 0) return acc;
    acc.sum += p; acc.max += m; return acc;
  }, { sum: 0, max: 0 });
  return totals.max ? (totals.sum / totals.max) * 100 : null;
};

// ─── Admin middleware ─────────────────────────────────────────────────────────

const adminKontrol = async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Yetkilendirme bilgisi eksik.' });
    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user || user.rol !== 'hoca') return res.status(403).json({ error: 'Bu işlem için hoca yetkisi gerekiyor.' });
    req.currentUser = user;
    req.isAdmin = await isAdminUser(user);
    if (req.isAdmin) {
      const courses = await prisma.course.findMany({ select: { ders_kodu: true } });
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

// ─── AUTH ─────────────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { ogrenci_no, ad_soyad, sifre, secilenDersler } = req.body;
  const no = normNo(ogrenci_no);
  const isim = normName(ad_soyad);
  try {
    const allowed = await prisma.allowedStudent.findUnique({ where: { ogrenci_no: no } });
    if (!allowed) return res.status(403).json({ error: 'Öğrenci numaranız sistemde tanımlı değil. Lütfen hocanızla iletişime geçin.' });
    if (normNameLC(allowed.ad_soyad) !== normNameLC(isim)) return res.status(403).json({ error: 'Ad soyad bilgisi kayıtla eşleşmiyor.' });

    const existing = await prisma.user.findUnique({ where: { ogrenci_no: no } });
    if (existing) return res.status(409).json({ error: 'Bu öğrenci numarasıyla zaten kayıt olunmuş.' });

    const izinliDersler = parseDersler(allowed.dersler);
    const yetkisiz = (secilenDersler || []).find(d => !izinliDersler.includes(d));
    if (yetkisiz) return res.status(403).json({ error: `${yetkisiz} dersini almaya yetkiniz görünmüyor.` });

    const hashedSifre = await hashPassword(sifre);
    await prisma.user.create({ data: { ogrenci_no: no, ad_soyad: isim, sifre: hashedSifre, rol: 'ogrenci' } });
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
    const user = await prisma.user.findUnique({ where: { ogrenci_no: no } });
    if (!user || !(await verifyPassword(sifre, user.sifre))) {
      return res.status(401).json({ error: 'Hatalı kullanıcı adı veya şifre!' });
    }
    if (needsRehash(user.sifre)) {
      await prisma.user.update({ where: { id: user.id }, data: { sifre: await hashPassword(sifre) } });
    }
    let dersler = [];
    if (user.rol === 'ogrenci') {
      const allowed = await prisma.allowedStudent.findUnique({ where: { ogrenci_no: no } });
      dersler = allowed ? parseDersler(allowed.dersler) : [];
    } else {
      dersler = parseDersler(user.authorized_course);
    }
    res.json({
      message: 'Giriş başarılı',
      user: { id: user.id, ad_soyad: user.ad_soyad, ogrenci_no: user.ogrenci_no, rol: user.rol, is_admin: await isAdminUser(user), dersler },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ─── ÖĞRENCİ LİSTESİ YÜKLEME ─────────────────────────────────────────────────

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
      const existing = await prisma.allowedStudent.findUnique({ where: { ogrenci_no: no } });
      if (existing) {
        const dersler = parseDersler(existing.dersler);
        if (!dersler.includes(secilenDers)) dersler.push(secilenDers);
        await prisma.allowedStudent.update({ where: { id: existing.id }, data: { dersler: dersler.join(','), ad_soyad: existing.ad_soyad || isim } });
      } else {
        await prisma.allowedStudent.create({ data: { ogrenci_no: no, ad_soyad: isim, dersler: secilenDers } });
      }
    }
    res.json({ message: 'Öğrenciler başarıyla listeye eklendi!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Veritabanına kaydedilirken hata oluştu.' });
  }
});

// ─── DERSLER ──────────────────────────────────────────────────────────────────

app.get('/api/courses', async (req, res) => {
  try {
    const courses = await prisma.course.findMany({ orderBy: { ders_adi: 'asc' } });
    res.json(courses);
  } catch (err) { res.status(500).json({ error: 'Dersler yüklenemedi.' }); }
});

app.post('/api/courses', adminKontrol, async (req, res) => {
  const { ders_kodu, ders_adi, aciklama } = req.body;
  if (!ders_kodu || !ders_adi) return res.status(400).json({ error: 'Ders kodu ve adı gereklidir.' });
  try {
    const existing = await prisma.course.findUnique({ where: { ders_kodu } });
    if (existing) return res.status(400).json({ error: 'Bu ders kodu zaten mevcut.' });
    const course = await prisma.course.create({ data: { ders_kodu, ders_adi, aciklama: aciklama || '' } });
    res.status(201).json(course);
  } catch (err) { res.status(500).json({ error: 'Ders eklenemedi.' }); }
});

app.delete('/api/courses/:dersKodu', adminKontrol, async (req, res) => {
  const { dersKodu } = req.params;
  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) return res.status(403).json({ error: 'Bu ders için yetkiniz yok.' });
  try {
    await prisma.criterion.deleteMany({ where: { ders_kodu: dersKodu } });
    await prisma.course.delete({ where: { ders_kodu: dersKodu } });
    res.json({ message: 'Ders silindi.' });
  } catch (err) { res.status(500).json({ error: 'Ders silinemedi.' }); }
});

// ─── KRİTERLER ───────────────────────────────────────────────────────────────

app.get('/api/criteria/:dersKodu', async (req, res) => {
  try {
    const criteria = await prisma.criterion.findMany({ where: { ders_kodu: req.params.dersKodu }, orderBy: { id: 'asc' } });
    res.json(criteria);
  } catch (err) { res.status(500).json({ error: 'Kriterler yüklenemedi.' }); }
});

app.post('/api/criteria', adminKontrol, async (req, res) => {
  const { kriter_adi, max_puan, ders_kodu } = req.body;
  if (!hasCourseAccess(req.authorizedCourses, ders_kodu)) return res.status(403).json({ error: 'Bu ders için yetkiniz yok.' });
  try {
    const criterion = await prisma.criterion.create({ data: { kriter_adi, max_puan: parseInt(max_puan) || 100, ders_kodu } });
    res.json(criterion);
  } catch (err) { res.status(500).json({ error: 'Kriter eklenemedi.' }); }
});

// ─── ÖDEV YÜKLEME ────────────────────────────────────────────────────────────

app.post('/api/submissions', async (req, res) => {
  const { userId, video_url, ders_kodu, proje_aciklamasi } = req.body;
  if (!userId || !video_url || !ders_kodu) return res.status(400).json({ error: 'UserId, video_url ve ders_kodu gereklidir.' });
  try {
    const existing = await prisma.submission.findFirst({ where: { userId: parseInt(userId), ders_kodu } });
    if (existing) return res.status(400).json({ error: 'Bu ders için zaten bir video yüklediniz.' });
    await prisma.submission.create({ data: { userId: parseInt(userId), video_url, ders_kodu, proje_aciklamasi: proje_aciklamasi || '' } });
    res.json({ message: 'Videonuz başarıyla yüklendi!' });
  } catch (err) { res.status(500).json({ error: 'Video yüklenirken hata oluştu.' }); }
});

// ─── VİDEO ATAMA ─────────────────────────────────────────────────────────────

app.get('/api/assign-video/:userId/:dersKodu', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { dersKodu } = req.params;
  try {
    const limit = await getEvaluationLimit(dersKodu);
    const gradedSubs = await prisma.grade.findMany({
      where: { puan_veren_id: userId, submission: { ders_kodu: dersKodu } },
      select: { submissionId: true },
      distinct: ['submissionId'],
    });
    const gradedIds = gradedSubs.map(g => g.submissionId);
    if (gradedIds.length >= limit) {
      return res.status(403).json({ error: `Bu ders için en fazla ${limit} video değerlendirebilirsiniz.`, limitReached: true, evaluationLimit: limit });
    }
    const eligible = await prisma.submission.findMany({
      where: { ders_kodu: dersKodu, userId: { not: userId }, id: gradedIds.length ? { notIn: gradedIds } : undefined },
      include: { user: { select: { ad_soyad: true, id: true } } },
    });
    if (!eligible.length) {
      // Tüm videolar puanlanmışsa herhangi birini ver
      const all = await prisma.submission.findMany({
        where: { ders_kodu: dersKodu, userId: { not: userId } },
        include: { user: { select: { ad_soyad: true, id: true } } },
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
  const sub = await prisma.submission.findFirst({ where: { userId: parseInt(userId), ders_kodu: dersKodu } });
  if (!sub) return res.json({ canEvaluate: false, message: 'Başkalarını puanlayabilmek için önce kendi projenizi yüklemelisiniz!' });
  res.json({ canEvaluate: true });
});

app.get('/api/check-submission-status', async (req, res) => {
  const { userId, dersKodu } = req.query;
  const sub = await prisma.submission.findFirst({ where: { userId: parseInt(userId), ders_kodu: dersKodu } });
  res.json({ hasUploaded: !!sub });
});

// ─── PUANLAMA ────────────────────────────────────────────────────────────────

app.post('/api/grades', async (req, res) => {
  const { submissionId, userId, scores, puanlananOgrenciId } = req.body;
  try {
    const submission = await prisma.submission.findUnique({ where: { id: parseInt(submissionId) } });
    if (!submission) return res.status(404).json({ error: 'Submission bulunamadı.' });
    if (!Array.isArray(scores) || !scores.length) return res.status(400).json({ error: 'En az bir kriter puanı gereklidir.' });

    const limit = await getEvaluationLimit(submission.ders_kodu);
    const gradedSubs = await prisma.grade.findMany({
      where: { puan_veren_id: parseInt(userId), submission: { ders_kodu: submission.ders_kodu } },
      select: { submissionId: true }, distinct: ['submissionId'],
    });
    const alreadyGradedThisSub = await prisma.grade.findFirst({
      where: { submissionId: parseInt(submissionId), puan_veren_id: parseInt(userId) },
    });
    if (gradedSubs.length >= limit && !alreadyGradedThisSub) {
      return res.status(403).json({ error: `Bu ders için en fazla ${limit} video değerlendirebilirsiniz.` });
    }

    const criterionIds = [...new Set(scores.map(s => parseInt(s.criterionId)))];
    const validCriteria = await prisma.criterion.findMany({
      where: { id: { in: criterionIds }, ders_kodu: submission.ders_kodu },
    });
    if (validCriteria.length !== criterionIds.length) return res.status(400).json({ error: 'Geçersiz kriter puanı gönderildi.' });
    const criterionMap = new Map(validCriteria.map(c => [c.id, c]));

    for (const score of scores) {
      const cId = parseInt(score.criterionId);
      const puan = parseInt(score.puan);
      const criterion = criterionMap.get(cId);
      if (!criterion) throw new Error('Geçersiz kriter.');
      if (!Number.isInteger(puan) || puan < criterion.min_puan || puan > criterion.max_puan) {
        throw new Error(`${criterion.kriter_adi} için geçerli aralık: ${criterion.min_puan}–${criterion.max_puan}.`);
      }
      await prisma.grade.upsert({
        where: { submissionId_puan_veren_id_criterionId: { submissionId: parseInt(submissionId), puan_veren_id: parseInt(userId), criterionId: cId } },
        create: { submissionId: parseInt(submissionId), puan_veren_id: parseInt(userId), criterionId: cId, puan, puanlanan_ogrenci_id: parseInt(puanlananOgrenciId) },
        update: { puan },
      });
    }
    res.json({ message: 'Kaydedildi.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Hata.' });
  }
});

// ─── HOCA PANELİ ─────────────────────────────────────────────────────────────

app.get('/api/admin/submissions/:dersKodu', adminKontrol, async (req, res) => {
  const { dersKodu } = req.params;
  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) return res.status(403).json({ error: 'Bu ders bilgilerine erişemezsiniz.' });
  try {
    const subs = await prisma.submission.findMany({
      where: { ders_kodu: dersKodu },
      include: { user: { select: { ad_soyad: true, ogrenci_no: true } }, grades: { select: { puan: true } } },
    });
    res.json(subs.map(s => ({
      ...s,
      User: { ad_soyad: s.user.ad_soyad, ogrenci_no: s.user.ogrenci_no },
      ortalama_puan: s.grades.length ? s.grades.reduce((a, g) => a + g.puan, 0) / s.grades.length : null,
    })));
  } catch (err) { res.status(500).json({ error: 'Veriler çekilemedi.' }); }
});

app.get('/api/admin/submission-detail/:submissionId', adminKontrol, async (req, res) => {
  const subId = parseInt(req.params.submissionId);
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: subId },
      include: {
        user: { select: { id: true, ad_soyad: true, ogrenci_no: true } },
        grades: {
          include: {
            criterion: { select: { id: true, kriter_adi: true, max_puan: true } },
            puanVeren: { select: { id: true, ad_soyad: true, rol: true } },
          },
        },
      },
    });
    if (!submission) return res.status(404).json({ error: 'Submission bulunamadı.' });
    // Admin ise tüm submission'lara erişebilir
    if (!req.isAdmin && !hasCourseAccess(req.authorizedCourses, submission.ders_kodu)) {
      return res.status(403).json({ error: 'Bu ders için yetkiniz yok.' });
    }

    const criterias = await prisma.criterion.findMany({ where: { ders_kodu: submission.ders_kodu } });
    const hocaPuanlari = [], akranPuanlari = [], alinanHoca = [], alinanAkran = [], alinanTum = [];

    for (const g of submission.grades) {
      const kayit = { id: g.id, criterionId: g.criterion?.id, puan: g.puan, kriter_adi: g.criterion?.kriter_adi, max_puan: g.criterion?.max_puan, veren: g.puanVeren?.ad_soyad, verenRol: g.puanVeren?.rol || 'ogrenci' };
      alinanTum.push(kayit);
      if (g.puanVeren?.rol === 'hoca') { hocaPuanlari.push(kayit); alinanHoca.push(kayit); }
      else { akranPuanlari.push(kayit); alinanAkran.push(kayit); }
    }

    const verilenGrades = await prisma.grade.findMany({
      where: { puan_veren_id: submission.userId, submission: { ders_kodu: submission.ders_kodu } },
      include: { criterion: { select: { kriter_adi: true, max_puan: true } }, submission: { include: { user: { select: { ad_soyad: true, ogrenci_no: true } } } } },
    });
    const ogrenciVerdigiPuanlar = verilenGrades
      .filter(g => g.submission?.userId !== submission.userId)
      .map(g => ({ id: g.id, puan: g.puan, kriter_adi: g.criterion?.kriter_adi, max_puan: g.criterion?.max_puan, puanlananOgrenci: g.submission?.user?.ad_soyad, puanlananOgrenciNo: g.submission?.user?.ogrenci_no, submissionId: g.submissionId }));

    res.json({
      id: submission.id, video_url: submission.video_url, proje_aciklamasi: submission.proje_aciklamasi, ders_kodu: submission.ders_kodu,
      hoca_genel_puani: weightedAvg(alinanHoca.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
      criterias,
      student: submission.user,
      hocaPuanlari, akranPuanlari, alinanHocaPuanlari: alinanHoca, alinanAkranPuanlari: alinanAkran, alinanTumPuanlar: alinanTum, ogrenciVerdigiPuanlar,
      istatistikler: {
        hocaGenelPuani: weightedAvg(alinanHoca.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
        alinanHocaOrtalamasi: weightedAvg(alinanHoca.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
        alinanAkranOrtalamasi: weightedAvg(alinanAkran.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
        alinanGenelOrtalama: weightedAvg(alinanTum.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
        verdigiOrtalama: weightedAvg(ogrenciVerdigiPuanlar.map(g => ({ puan: g.puan, criterion: { max_puan: g.max_puan } }))),
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Detay bilgisi çekilemedi.' }); }
});

app.post('/api/admin/grade-submission', adminKontrol, async (req, res) => {
  const { submissionId, puan } = req.body;
  try {
    const sub = await prisma.submission.findUnique({ where: { id: parseInt(submissionId) } });
    if (!sub) return res.status(404).json({ error: 'Submission bulunamadı.' });
    if (!hasCourseAccess(req.authorizedCourses, sub.ders_kodu)) return res.status(403).json({ error: 'Bu ders için yetkiniz yok.' });
    await prisma.submission.update({ where: { id: parseInt(submissionId) }, data: { hoca_puani: parseInt(puan) } });
    res.json({ message: 'Hoca puanı kaydedildi.' });
  } catch (err) { res.status(500).json({ error: 'Hata.' }); }
});

app.get('/api/admin/all-students-status/:dersKodu', adminKontrol, async (req, res) => {
  const { dersKodu } = req.params;
  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) return res.status(403).json({ error: 'Bu ders bilgilerine erişemezsiniz.' });
  try {
    const allowedAll = await prisma.allowedStudent.findMany({ where: { dersler: { contains: dersKodu } } });
    const allowed = allowedAll.filter(s => parseDersler(s.dersler).includes(dersKodu));
    const nos = allowed.map(s => s.ogrenci_no);
    const users = await prisma.user.findMany({ where: { ogrenci_no: { in: nos } } });
    const userMap = new Map(users.map(u => [u.ogrenci_no, u]));
    const userIds = users.map(u => u.id);
    const submissions = await prisma.submission.findMany({ where: { userId: { in: userIds }, ders_kodu: dersKodu } });
    const subMap = new Map(submissions.map(s => [s.userId, s]));
    const subIds = submissions.map(s => s.id);

    const grades = subIds.length ? await prisma.grade.findMany({
      where: { submissionId: { in: subIds } },
      include: { criterion: { select: { max_puan: true } }, puanVeren: { select: { rol: true } } },
    }) : [];

    const givenGrades = userIds.length ? await prisma.grade.findMany({
      where: { puan_veren_id: { in: userIds }, submission: { ders_kodu: dersKodu } },
      include: { submission: { select: { userId: true } }, criterion: { select: { max_puan: true } } },
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
      // sifre hash'ini response'a dahil etme
      const safeUser = user ? (({ sifre, ...rest }) => rest)(user) : null;
      return {
        ...s,
        RegisteredUser: safeUser ? { ...safeUser, Submissions: sub ? [sub] : [] } : null,
        alinan_ortalama: sub ? weightedAvg((receivedBySubId[sub.id] || []).map(g => ({ puan: g.puan, criterion: g.criterion }))) : null,
        verdigi_ortalama: user ? weightedAvg((givenByUserId[user.id] || []).map(g => ({ puan: g.puan, criterion: g.criterion }))) : null,
        hoca_genel_puani: sub ? weightedAvg((hocaBySubId[sub.id] || []).map(g => ({ puan: g.puan, criterion: g.criterion }))) : null,
      };
    });
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Liste çekilirken hata oluştu.' }); }
});

// ─── HOCA YÖNETİMİ ───────────────────────────────────────────────────────────

app.get('/api/admin/instructors', adminKontrol, async (req, res) => {
  try {
    const instructors = await prisma.user.findMany({ where: { rol: 'hoca' }, select: { id: true, ogrenci_no: true, ad_soyad: true, authorized_course: true } });
    res.json(instructors.map(i => ({ ...i, authorized_courses: parseDersler(i.authorized_course) })));
  } catch (err) { res.status(500).json({ error: 'Hocalar çekilemedi.' }); }
});

app.post('/api/admin/instructors', adminKontrol, async (req, res) => {
  const { ogrenci_no, ad_soyad, sifre, authorized_courses } = req.body;
  const dersler = parseDersler(req.body.authorized_courses || req.body.authorized_course);
  if (!ogrenci_no || !ad_soyad || !sifre || !dersler.length) return res.status(400).json({ error: 'Tüm alanlar zorunludur.' });
  try {
    const existing = await prisma.user.findUnique({ where: { ogrenci_no } });
    if (existing) return res.status(400).json({ error: 'Bu numarada kullanıcı zaten mevcut.' });
    const validCourses = await prisma.course.count({ where: { ders_kodu: { in: dersler } } });
    if (validCourses !== dersler.length) return res.status(400).json({ error: 'Seçilen ders mevcut değil.' });
    const hashedSifre = await hashPassword(sifre);
    const hoca = await prisma.user.create({ data: { ogrenci_no, ad_soyad, sifre: hashedSifre, rol: 'hoca', authorized_course: dersler.join(',') } });
    res.status(201).json({ id: hoca.id, ogrenci_no, ad_soyad, authorized_course: hoca.authorized_course, authorized_courses: dersler });
  } catch (err) { res.status(500).json({ error: 'Hoca eklenemedi.' }); }
});

app.delete('/api/admin/instructors/:id', adminKontrol, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Hoca silme yetkisi sadece admin hocadadır.' });
  try {
    const hoca = await prisma.user.findFirst({ where: { id: parseInt(req.params.id), rol: 'hoca' } });
    if (!hoca) return res.status(404).json({ error: 'Hoca bulunamadı.' });
    await prisma.user.delete({ where: { id: hoca.id } });
    res.json({ message: 'Hoca silindi.' });
  } catch (err) { res.status(500).json({ error: 'Hoca silinemedi.' }); }
});

// ─── AYARLAR ─────────────────────────────────────────────────────────────────

app.get('/api/settings/video_limit', adminKontrol, async (req, res) => {
  const dersKodu = String(req.query.dersKodu || '').trim();
  if (!dersKodu) return res.status(400).json({ error: 'dersKodu zorunludur.' });
  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) return res.status(403).json({ error: 'Bu ders ayarına erişemezsiniz.' });
  const setting = await prisma.setting.findUnique({ where: { key: getVideoLimitKey(dersKodu) } });
  res.json({ value: setting?.value ?? '3' });
});

app.post('/api/settings/update-limit', adminKontrol, async (req, res) => {
  const limit = Number(req.body?.limit);
  const dersKodu = String(req.body?.dersKodu || '').trim();
  if (!Number.isInteger(limit) || limit <= 0) return res.status(400).json({ error: 'Geçerli bir limit değeri gönderin.' });
  if (!dersKodu) return res.status(400).json({ error: 'dersKodu zorunludur.' });
  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) return res.status(403).json({ error: 'Bu ders ayarını güncelleyemezsiniz.' });
  const key = getVideoLimitKey(dersKodu);
  await prisma.setting.upsert({ where: { key }, create: { key, value: String(limit) }, update: { value: String(limit) } });
  res.json({ success: true, message: 'Limit başarıyla güncellendi!' });
});

// ─── Başlat ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5002;

const startServer = async () => {
  try {
    await connectDB();
    await sequelize.sync({alter: true});
    app.listen(PORT, () => console.log(`📡 Sunucu çalışıyor: ${PORT}`));
  } catch (err) {
    console.error('Sunucu başlatılamadı:', err);
    process.exit(1);
  }
};

startServer();
