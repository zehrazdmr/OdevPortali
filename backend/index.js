const express = require('express');
const cors = require('cors');
const { connectDB, sequelize } = require('./db');
const { User, Criterion, Submission, Grade, AllowedStudent, Settings, Course, verifyPassword, needsPasswordRehash } = require('./models');
const { Op } = require('sequelize'); 

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_VIDEO_LIMIT = 3;

const parseCourseList = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(value.map((course) => String(course || '').trim()).filter(Boolean))];
  }

  if (typeof value === 'string') {
    return [...new Set(value.split(',').map((course) => course.trim()).filter(Boolean))];
  }

  return [];
};

const hasCourseAccess = (authorizedCourses, courseCode) => {
  if (!courseCode) return true;
  return authorizedCourses.includes(String(courseCode).trim());
};

const getVideoLimitKey = (dersKodu) => dersKodu ? `video_limit:${String(dersKodu).trim()}` : 'video_limit';

const getEvaluationLimit = async (dersKodu) => {
  const courseKey = getVideoLimitKey(dersKodu);
  const setting = await Settings.findOne({
    where: { key: { [Op.in]: [courseKey, 'video_limit'] } },
    order: [['key', 'ASC']]
  });
  const parsedLimit = Number(setting?.value);
  return Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_VIDEO_LIMIT;
};

const isAdminInstructor = async (user) => {
  if (!user || user.rol !== 'hoca') return false;
  if (user.is_admin) return true;

  const firstInstructor = await User.findOne({
    where: { rol: 'hoca' },
    order: [['id', 'ASC']]
  });

  return !!firstInstructor && firstInstructor.id === user.id;
};

const getUserEvaluatedSubmissionIdsForCourse = async (userId, dersKodu) => {
  const grades = await Grade.findAll({
    where: { puan_veren_id: userId },
    include: [{
      model: Submission,
      attributes: [],
      where: { ders_kodu: dersKodu }
    }],
    attributes: ['SubmissionId'],
    group: ['SubmissionId']
  });

  return grades.map(grade => grade.SubmissionId);
};

// --- MIDDLEWARE ---
const adminKontrol = async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({ error: 'Yetkilendirme bilgisi eksik.' });
    }

    const user = await User.findByPk(userId);

    if (!user || user.rol !== 'hoca') {
      return res.status(403).json({ error: 'Bu islem icin hoca yetkisi gerekiyor.' });
    }

    req.currentUser = user;
    req.authorizedCourses = parseCourseList(user.authorized_course);
    req.isAdmin = await isAdminInstructor(user);
    next();
  } catch (error) {
    console.error('adminKontrol hatasi:', error);
    res.status(500).json({ error: 'Yetki kontrolu yapilamadi.' });
  }
};

// --- ROTALAR ---

// KAYIT OLMA
app.post('/api/auth/register', async (req, res) => {
  const { ogrenci_no, ad_soyad, sifre, secilenDersler } = req.body;

  try {
    const allowed = await AllowedStudent.findOne({ where: { ogrenci_no } });

    if (!allowed) {
      return res.status(403).json({ error: "Öğrenci numaranız sistemde tanımlı değil. Lütfen hocanızla iletişime geçin." });
    }

    const hocaDersleri = allowed.dersler.split(',');
    const yetkisizDers = secilenDersler.find(d => !hocaDersleri.includes(d));

    if (yetkisizDers) {
      return res.status(403).json({ error: `${yetkisizDers} dersini almaya yetkiniz görünmüyor.` });
    }

  
    const newUser = await User.create({
      ogrenci_no,
      ad_soyad,
      sifre,
      rol: 'ogrenci'
    });

    res.json({ message: "Kayıt başarılı" });
  } catch (error) {
    res.status(500).json({ error: "Kayıt hatası" });
  }
});

// GİRİŞ YAPMA
app.post('/api/auth/login', async (req, res) => {
  const { ogrenci_no, sifre } = req.body;

  try {
    const user = await User.findOne({
      where: {
        ogrenci_no
      }
    });

    if (!user || !(await verifyPassword(sifre, user.sifre))) {
      return res.status(401).json({ error: "Hatalı numara veya şifre!" });
    }

    if (needsPasswordRehash(user.sifre)) {
      user.sifre = sifre;
      await user.save();
    }

    let dersListesi = [];
    if (user.rol === 'ogrenci') {
      const allowed = await AllowedStudent.findOne({ where: { ogrenci_no: ogrenci_no } });
      console.log(`🔐 Login: ${ogrenci_no} öğrenci kaydı:`, allowed);
      
      if (allowed && allowed.dersler) {
        dersListesi = allowed.dersler.split(',').map(d => d.trim()).filter(d => d.length > 0);
        console.log(`📚 Dersleri parse edildı:`, dersListesi);
      } else {
        console.log(`⚠️ ${ogrenci_no} için AllowedStudent kaydı bulunamadı!`);
      }
    } else if (user.rol === 'hoca') {
      dersListesi = parseCourseList(user.authorized_course);
    }

    res.json({
      message: "Giriş başarılı",
      user: {
        id: user.id,
        ad_soyad: user.ad_soyad,
        ogrenci_no: user.ogrenci_no,
        rol: user.rol,
        is_admin: user.rol === 'hoca' ? await isAdminInstructor(user) : false,
        dersler: dersListesi
      }
    });
  } catch (error) {
    console.error("❌ Login Hatası:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// --- ÖĞRENCİ LİSTESİ YÜKLEME ---
app.post('/api/admin/upload-students', async (req, res) => {
  const { students, secilenDers } = req.body;

  try {
    const actingUser = await User.findByPk(req.headers['x-user-id']);

    if (!actingUser || actingUser.rol !== 'hoca') {
      return res.status(403).json({ error: 'Bu islem icin hoca yetkisi gerekiyor.' });
    }

    if (!hasCourseAccess(parseCourseList(actingUser.authorized_course), secilenDers)) {
      return res.status(403).json({ error: 'Bu ders icin yetkiniz yok.' });
    }

    const gercekOgrenciler = students.slice(2); 

    for (const s of gercekOgrenciler) {
      const ogrenci_no = s["__EMPTY"];
      const adSoyad = s["__EMPTY_1"] ? s["__EMPTY_1"].trim() : "";

      if (!ogrenci_no || ogrenci_no === "Öğrenci No") continue;

      let record = await AllowedStudent.findOne({ where: { ogrenci_no: String(ogrenci_no) } });

      if (record) {
        let mevcutDersler = record.dersler ? record.dersler.split(',') : [];
        if (!mevcutDersler.includes(secilenDers)) {
          mevcutDersler.push(secilenDers);
          record.dersler = mevcutDersler.join(',');
          await record.save();
        }
      } else {
        await AllowedStudent.create({
          ogrenci_no: String(ogrenci_no),
          ad_soyad: adSoyad,
          dersler: secilenDers
        });
      }
    }
    res.json({ message: 'Öğrenciler başarıyla listeye eklendi!' });
  } catch (error) {
    console.error("Yükleme Hatası:", error);
    res.status(500).json({ error: 'Veritabanına kaydedilirken hata oluştu.' });
  }
});

// HOCA PUANI KAYDET
app.post('/api/admin/grade-submission', async (req, res) => {
  const { submissionId, hocaId, puan } = req.body;
  try {
    const actingUser = await User.findByPk(req.headers['x-user-id']);
    if (!actingUser || actingUser.rol !== 'hoca') {
      return res.status(403).json({ error: 'Bu islem icin hoca yetkisi gerekiyor.' });
    }
    const submission = await Submission.findByPk(submissionId);
    if (!submission) return res.status(404).json({ error: 'Submission bulunamadı.' });
    if (!hasCourseAccess(parseCourseList(actingUser.authorized_course), submission.ders_kodu)) {
      return res.status(403).json({ error: 'Bu ders icin yetkiniz yok.' });
    }
    submission.hoca_puani = puan;
    await submission.save();
    res.json({ message: 'Hoca puanı kaydedildi.' });
  } catch (error) {
    res.status(500).json({ error: 'Hata.' });
  }   
});

// VİDEO YÜKLEME 
app.post('/api/submissions', async (req, res) => {
  const { userId, video_url, ders_kodu, proje_aciklamasi } = req.body;

  try {
    const existing = await Submission.findOne({ where: { UserId: userId, ders_kodu } });
    if (existing) {
      return res.status(400).json({ error: "Bu ders için zaten bir video yüklediniz. Tekrar yükleyemezsiniz." });
    }

    if (!userId || !video_url || !ders_kodu) {
      return res.status(400).json({ error: "UserId, video_url ve ders_kodu gereklidir." });
    }

    await Submission.create({ 
      UserId: userId, 
      video_url, 
      ders_kodu,
      proje_aciklamasi: proje_aciklamasi || ""
    });
    res.json({ message: "Videonuz başarıyla yüklendi!" });
  } catch (error) {
    console.error("Video yükleme hatası:", error);
    res.status(500).json({ error: error.message || "Video yüklenirken hata oluştu." });
  }
});

// VİDEO ATAMA 
app.get('/api/assign-video/:userId/:dersKodu', async (req, res) => {
  const { userId, dersKodu } = req.params;
  try {
    console.log(`🔍 Video atanıyor - UserId: ${userId}, Ders: ${dersKodu}`);

    const evaluationLimit = await getEvaluationLimit(dersKodu);
    const gradedIds = await getUserEvaluatedSubmissionIdsForCourse(userId, dersKodu);

    if (gradedIds.length >= evaluationLimit) {
      return res.status(403).json({
        error: `Bu ders için en fazla ${evaluationLimit} video değerlendirebilirsiniz.`,
        limitReached: true,
        evaluationLimit
      });
    }

    console.log(`⏭️ Önceden puanlanmış: ${gradedIds.length} video`);

    const whereCondition = {
      ders_kodu: dersKodu,
      UserId: { [Op.ne]: parseInt(userId) }
    };

    if (gradedIds.length > 0) {
      whereCondition.id = { [Op.notIn]: gradedIds };
    }

    const allEligible = await Submission.findAll({
      where: whereCondition,
      attributes: ['id', 'UserId', 'ders_kodu']
    });
    console.log(`📹 Uygun submission sayısı: ${allEligible.length}`);

    const submission = await Submission.findOne({
      where: whereCondition,
      include: [{ model: User, attributes: ['ad_soyad', 'id'] }],
      order: [sequelize.fn('RANDOM')]
    });

    if (!submission) {
      console.log(`❌ Hiç video bulunamadı`);
      return res.status(404).json({ error: 'Puanlanacak video kalmadı.' });
    }
    
    console.log(`✅ Video bulundu - ID: ${submission.id}`);
    res.json(submission);
  } catch (error) {
    console.error('🔴 Video atama hatası:', error.message);
    res.status(500).json({ error: `Video atama hatası: ${error.message}` });
  }
});

app.get('/api/can-evaluate/:userId/:dersKodu', async (req, res) => {
  const { userId, dersKodu } = req.params;

  const sub = await Submission.findOne({ where: { UserId: userId, ders_kodu: dersKodu } });
  if (!sub) {
    return res.json({ canEvaluate: false, message: "Başkalarını puanlayabilmek için önce kendi projenizi yüklemelisiniz!" });
  }
  res.json({ canEvaluate: true });
});

app.get('/api/check-submission-status', async (req, res) => {
  const { userId, dersKodu } = req.query;

  try {
    const submission = await Submission.findOne({ 
      where: { UserId: userId, ders_kodu: dersKodu } 
    });

    if (submission) {
      res.json({ hasUploaded: true });
    } else {
      res.json({ hasUploaded: false });
    }
  } catch (error) {
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

//  HOCA PANELİ - TÜM SUBMISSION'LAR
app.get('/api/admin/submissions/:dersKodu', adminKontrol, async (req, res) => {
  const { dersKodu } = req.params;
  try {
    if (!hasCourseAccess(req.authorizedCourses, dersKodu)) {
      return res.status(403).json({ error: 'Bu ders bilgilerine erisemezsiniz.' });
    }
    const submissions = await Submission.findAll({
      where: { ders_kodu: dersKodu },
      attributes: [
        'id', 'video_url', 'ders_kodu', 'proje_aciklamasi', 'UserId',
        [sequelize.fn('AVG', sequelize.col('Grades.puan')), 'ortalama_puan']
      ],
      include: [
        { model: User, attributes: ['ad_soyad', 'ogrenci_no'] },
        { model: Grade, attributes: [] }
      ],
      group: ['Submission.id', 'User.id'],
      subQuery: false,
    });
    res.json(submissions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Veriler çekilemedi.' });
  }
});

// HOCA PANELİ - DETAYLI SUBMISSION BİLGİSİ
app.get('/api/admin/submission-detail-legacy/:submissionId', adminKontrol, async (req, res) => {
  const { submissionId } = req.params;
  try {
    const submission = await Submission.findByPk(submissionId, {
      include: [
        { 
          model: User, 
          attributes: ['id', 'ad_soyad', 'ogrenci_no']
        },
        {
          model: Grade,
          include: [
            { model: Criterion, attributes: ['id', 'kriter_adi', 'max_puan'] },
            { model: User, as: 'PuanVeren', attributes: ['id', 'ad_soyad', 'rol'] }
          ]
        }
      ]
    });

    const hocaPuanlari = [];
    const akranPuanlari = [];
    const ogrenciVerdigiPuanlar = [];

    if (submission.Grades) {
      submission.Grades.forEach(grade => {
        if (grade.PuanVeren?.rol === 'hoca') {
          hocaPuanlari.push({
            id: grade.id,
            puan: grade.puan,
            kriter_adi: grade.Criterion?.kriter_adi,
            max_puan: grade.Criterion?.max_puan
          });
        } 
        else if (grade.puan_veren_id !== submission.UserId) {
          akranPuanlari.push({
            id: grade.id,
            puan: grade.puan,
            kriter_adi: grade.Criterion?.kriter_adi,
            veren: grade.PuanVeren?.ad_soyad
          });
        }
        else if (grade.puan_veren_id === submission.UserId) {
          ogrenciVerdigiPuanlar.push({
            id: grade.id,
            puan: grade.puan,
            kriter_adi: grade.Criterion?.kriter_adi,
            puanlananOgrenci: 'Başka Öğrenci'
          });
        }
      });
    }

    const response = {
      id: submission.id,
      video_url: submission.video_url,
      proje_aciklamasi: submission.proje_aciklamasi,
      ders_kodu: submission.ders_kodu,
      hoca_puani: submission.hoca_puani,
      student: {
        id: submission.User.id,
        ad_soyad: submission.User.ad_soyad,
        ogrenci_no: submission.User.ogrenci_no
      },
      hocaPuanlari: hocaPuanlari,
      akranPuanlari: akranPuanlari,
      ogrenciVerdigiPuanlar: ogrenciVerdigiPuanlar
    };

    res.json(response);
  } catch (error) {
    console.error('Submission detay hatası:', error);
    res.status(500).json({ error: 'Detay bilgisi çekilemedi.' });
  }
});

// KRİTER EKLE VE GETİR
app.get('/api/admin/submission-detail/:submissionId', adminKontrol, async (req, res) => {
  const { submissionId } = req.params;

  try {
    const submission = await Submission.findByPk(submissionId, {
      include: [
        {
          model: User,
          attributes: ['id', 'ad_soyad', 'ogrenci_no']
        },
        {
          model: Grade,
          include: [
            { model: Criterion, attributes: ['id', 'kriter_adi', 'max_puan'] },
            { model: User, as: 'PuanVeren', attributes: ['id', 'ad_soyad', 'rol'] }
          ]
        }
      ]
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission bulunamadi.' });
    }

    if (!hasCourseAccess(req.authorizedCourses, submission.ders_kodu)) {
      return res.status(403).json({ error: 'Bu ders bilgilerine erisemezsiniz.' });
    }

    const hocaPuanlari = [];
    const akranPuanlari = [];
    const alinanTumPuanlar = [];

    if (submission.Grades) {
      submission.Grades.forEach((grade) => {
        const ortakKayit = {
          id: grade.id,
          puan: grade.puan,
          kriter_adi: grade.Criterion?.kriter_adi,
          max_puan: grade.Criterion?.max_puan,
          veren: grade.PuanVeren?.ad_soyad || (grade.PuanVeren?.rol === 'hoca' ? 'Hoca' : 'Ogrenci'),
          verenRol: grade.PuanVeren?.rol || 'ogrenci'
        };

        alinanTumPuanlar.push(ortakKayit);

        if (grade.PuanVeren?.rol === 'hoca') {
          hocaPuanlari.push(ortakKayit);
        } else {
          akranPuanlari.push(ortakKayit);
        }
      });
    }

    const verilenPuanKayitlari = await Grade.findAll({
      where: { puan_veren_id: submission.UserId },
      include: [
        { model: Criterion, attributes: ['id', 'kriter_adi', 'max_puan'] },
        {
          model: Submission,
          attributes: ['id', 'ders_kodu', 'UserId'],
          where: { ders_kodu: submission.ders_kodu },
          include: [{ model: User, attributes: ['id', 'ad_soyad', 'ogrenci_no'] }]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const ogrenciVerdigiPuanlar = verilenPuanKayitlari
      .filter((grade) => grade.Submission && grade.Submission.UserId !== submission.UserId)
      .map((grade) => ({
        id: grade.id,
        puan: grade.puan,
        kriter_adi: grade.Criterion?.kriter_adi,
        max_puan: grade.Criterion?.max_puan,
        puanlananOgrenci: grade.Submission?.User?.ad_soyad || 'Bilinmiyor',
        puanlananOgrenciNo: grade.Submission?.User?.ogrenci_no || '-',
        submissionId: grade.SubmissionId
      }));

    const ortalamaHesapla = (liste) => {
      if (!liste.length) return 0;
      return liste.reduce((sum, item) => sum + Number(item.puan || 0), 0) / liste.length;
    };

    res.json({
      id: submission.id,
      video_url: submission.video_url,
      proje_aciklamasi: submission.proje_aciklamasi,
      ders_kodu: submission.ders_kodu,
      hoca_puani: submission.hoca_puani,
      student: {
        id: submission.User.id,
        ad_soyad: submission.User.ad_soyad,
        ogrenci_no: submission.User.ogrenci_no
      },
      hocaPuanlari,
      akranPuanlari,
      alinanTumPuanlar,
      ogrenciVerdigiPuanlar,
      istatistikler: {
        hocaOrtalamasi: ortalamaHesapla(hocaPuanlari),
        alinanAkranOrtalamasi: ortalamaHesapla(akranPuanlari),
        alinanGenelOrtalama: ortalamaHesapla(alinanTumPuanlar),
        verdigiOrtalama: ortalamaHesapla(ogrenciVerdigiPuanlar)
      }
    });
  } catch (error) {
    console.error('Submission detay hatasi:', error);
    res.status(500).json({ error: 'Detay bilgisi cekilemedi.' });
  }
});

app.get('/api/criteria/:dersKodu', async (req, res) => {
  const criteria = await Criterion.findAll({ where: { ders_kodu: req.params.dersKodu } });
  res.json(criteria);
});

// KRİTER EKLE  
app.post('/api/criteria', adminKontrol, async (req, res) => {
  if (!hasCourseAccess(req.authorizedCourses, req.body?.ders_kodu)) {
    return res.status(403).json({ error: 'Bu ders icin yetkiniz yok.' });
  }
  const newCriterion = await Criterion.create(req.body);
  res.json(newCriterion);
});

// PUANLARI KAYDET
app.post('/api/grades', async (req, res) => {
  const { submissionId, userId, scores, puanlananOgrenciId } = req.body; 
  try {
    const submission = await Submission.findByPk(submissionId);

    if (!submission) {
      return res.status(404).json({ error: 'Submission bulunamadı.' });
    }

    const existingGrade = await Grade.findOne({
      where: {
        SubmissionId: submissionId,
        puan_veren_id: userId
      }
    });

    if (existingGrade) {
      return res.status(400).json({ error: 'Bu videoyu zaten değerlendirdiniz.' });
    }

    const evaluationLimit = await getEvaluationLimit(submission.ders_kodu);
    const gradedIds = await getUserEvaluatedSubmissionIdsForCourse(userId, submission.ders_kodu);

    if (gradedIds.length >= evaluationLimit) {
      return res.status(403).json({ error: `Bu ders için en fazla ${evaluationLimit} video değerlendirebilirsiniz.` });
    }

    const gradePromises = scores.map(s => {
      return Grade.create({
        puan: s.puan,
        SubmissionId: submissionId,
        puan_veren_id: userId,
        puanlanan_ogrenci_id: puanlananOgrenciId,
        CriterionId: s.criterionId
      });
    });
    await Promise.all(gradePromises);
    res.json({ message: 'Kaydedildi.' });
  } catch (error) {
    res.status(500).json({ error: 'Hata.' });
  }
});
// TÜM ÖĞRENCİLERİN DURUMUNU GETİR (Admin Paneli için)
app.get('/api/admin/all-students-status/:dersKodu', adminKontrol, async (req, res) => {
  const { dersKodu } = req.params;
  try {
    if (!hasCourseAccess(req.authorizedCourses, dersKodu)) {
      return res.status(403).json({ error: 'Bu ders bilgilerine erisemezsiniz.' });
    }
    const students = await AllowedStudent.findAll({
      where: {
        dersler: { [Op.like]: `%${dersKodu}%` }
      },
      include: [
        { 
          model: User, 
          as: 'RegisteredUser',
          include: [{ model: Submission, where: { ders_kodu: dersKodu }, required: false }]
        }
      ]
    });
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Liste çekilirken hata oluştu.' });
  }
});

// --- DERS YÖNETİMİ API'LAR ---
// TÜM DERSLERİ GETİR
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await Course.findAll();
    res.json(courses);
  } catch (error) {
    console.error('Dersler çekme hatası:', error);
    res.status(500).json({ error: 'Dersler çekilemedi.' });
  }
});

// YENİ DERS EKLE (Admin)
app.post('/api/courses', adminKontrol, async (req, res) => {
  const { ders_kodu, ders_adi, aciklama } = req.body;

  if (!ders_kodu || !ders_adi) {
    return res.status(400).json({ error: 'Ders kodu ve adı gereklidir.' });
  }

  try {
    const existing = await Course.findOne({ where: { ders_kodu } });
    if (existing) {
      return res.status(400).json({ error: 'Bu ders kodu zaten mevcut.' });
    }

    const newCourse = await Course.create({
      ders_kodu,
      ders_adi,
      aciklama: aciklama || ''
    });

    console.log(`✅ Yeni ders eklendi: ${ders_adi} (${ders_kodu})`);
    res.status(201).json(newCourse);
  } catch (error) {
    console.error('Ders ekleme hatası:', error);
    res.status(500).json({ error: 'Ders eklenemedi.' });
  }
});

// DERSI SİL (Admin)
app.delete('/api/courses/:dersKodu', adminKontrol, async (req, res) => {
  const { dersKodu } = req.params;

  try {
    if (!hasCourseAccess(req.authorizedCourses, dersKodu)) {
      return res.status(403).json({ error: 'Bu ders icin yetkiniz yok.' });
    }

    const course = await Course.findOne({ where: { ders_kodu: dersKodu } });
    if (!course) {
      return res.status(404).json({ error: 'Ders bulunamadı.' });
    }

    await Criterion.destroy({ where: { ders_kodu: dersKodu } });

    await course.destroy();

    console.log(`🗑️ Ders silindi: ${dersKodu}`);
    res.json({ message: 'Ders başarıyla silindi.' });
  } catch (error) {
    console.error('Ders silme hatası:', error);
    res.status(500).json({ error: 'Ders silinemedi.' });
  }
});

// --- HOCA YETKİLENDİRME API'LARI ---
app.get('/api/admin/instructors', adminKontrol, async (req, res) => {
  try {
    const instructors = await User.findAll({ where: { rol: 'hoca' }, attributes: ['id', 'ogrenci_no', 'ad_soyad', 'authorized_course'] });
    res.json(instructors.map((inst) => ({
      id: inst.id,
      ogrenci_no: inst.ogrenci_no,
      ad_soyad: inst.ad_soyad,
      authorized_course: inst.authorized_course,
      authorized_courses: parseCourseList(inst.authorized_course)
    })));
  } catch (error) {
    console.error('Hocalar çekilemedi:', error);
    res.status(500).json({ error: 'Hocalar çekilemedi.' });
  }
});

app.post('/api/admin/instructors', adminKontrol, async (req, res) => {
  const { ogrenci_no, ad_soyad, sifre } = req.body;
  const authorizedCourses = parseCourseList(req.body.authorized_courses || req.body.authorized_course);

  if (!ogrenci_no || !ad_soyad || !sifre || authorizedCourses.length === 0) {
    return res.status(400).json({ error: 'Tüm alanlar zorunludur: numara, ad soyad, şifre, yetkili ders.' });
  }

  try {
    const existing = await User.findOne({ where: { ogrenci_no } });
    if (existing) {
      return res.status(400).json({ error: 'Bu numarada bir kullanıcı zaten mevcut.' });
    }

    const courseCount = await Course.count({ where: { ders_kodu: { [Op.in]: authorizedCourses } } });
    if (courseCount !== authorizedCourses.length) {
      return res.status(400).json({ error: 'Seçilen ders mevcut değil.' });
    }

    const newInstructor = await User.create({
      ogrenci_no,
      ad_soyad,
      sifre,
      rol: 'hoca',
      authorized_course: authorizedCourses.join(',')
    });

    res.status(201).json({
      id: newInstructor.id,
      ogrenci_no,
      ad_soyad,
      authorized_course: newInstructor.authorized_course,
      authorized_courses: authorizedCourses
    });
  } catch (error) {
    console.error('Hoca ekleme hatası:', error);
    res.status(500).json({ error: 'Hoca eklenemedi.' });
  }
});

app.delete('/api/admin/instructors/:id', adminKontrol, async (req, res) => {
  const { id } = req.params;

  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Hoca silme yetkisi sadece admin hocadadir.' });
    }
    const instructor = await User.findOne({ where: { id, rol: 'hoca' } });
    if (!instructor) {
      return res.status(404).json({ error: 'Hoca bulunamadı.' });
    }

    await instructor.destroy();
    res.json({ message: 'Hoca silindi.' });
  } catch (error) {
    console.error('Hoca silme hatası:', error);
    res.status(500).json({ error: 'Hoca silinemedi.' });
  }
});

app.get('/api/settings/video_limit', adminKontrol, async (req, res) => {
  try {
    const dersKodu = String(req.query?.dersKodu || '').trim();

    if (!dersKodu) {
      return res.status(400).json({ error: 'dersKodu zorunludur.' });
    }

    if (!hasCourseAccess(req.authorizedCourses, dersKodu)) {
      return res.status(403).json({ error: 'Bu ders ayarina erisemezsiniz.' });
    }

    const setting = await Settings.findOne({ where: { key: getVideoLimitKey(dersKodu) } });

    if (!setting) {
      return res.json({ value: '3' });
    }

    res.json({ value: setting.value });
  } catch (err) {
    console.error('Limit okuma hatası:', err);
    res.status(500).json({ error: "Veritabanı hatası!" });
  }
});

app.post('/api/settings/update-limit', adminKontrol, async (req, res) => {
  const parsedLimit = Number(req.body?.limit);
  const dersKodu = String(req.body?.dersKodu || '').trim();

  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
    return res.status(400).json({ error: "Geçerli bir limit değeri gönderin." });
  }

  if (!dersKodu) {
    return res.status(400).json({ error: 'dersKodu zorunludur.' });
  }

  if (!hasCourseAccess(req.authorizedCourses, dersKodu)) {
    return res.status(403).json({ error: 'Bu ders ayarini guncelleyemezsiniz.' });
  }

  try {
    await Settings.upsert({
      key: getVideoLimitKey(dersKodu),
      value: String(parsedLimit)
    });

    res.json({ success: true, message: "Limit başarıyla güncellendi!" });
  } catch (err) {
    console.error('Limit güncelleme hatası:', err);
    res.status(500).json({ error: "Veritabanı hatası!" });
  }
});

const PORT = 5000;
connectDB();
sequelize.sync({ alter: true }).then(async () => { 
  app.listen(PORT, () => console.log(`📡 Sunucu çalışıyor: ${PORT}`));
});
