import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { api } from '../services/api';

const AdminPanel = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
  const [selectedCourse, setSelectedCourse] = useState(localStorage.getItem('selectedCourse') || '');
  

  const [allStudents, setAllStudents] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all'); 
  const [kriterAdi, setKriterAdi] = useState('');
  const [maxPuan, setMaxPuan] = useState(100);
  const [criteria, setCriteria] = useState([]);
  const [uploadCourse, setUploadCourse] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const [selectedStudentReport, setSelectedStudentReport] = useState(null);
  const [submissionDetail, setSubmissionDetail] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [hocaKriterPuanlari, setHocaKriterPuanlari] = useState({});
  const [evaluationLimit, setEvaluationLimit] = useState('');

  const [courses, setCourses] = useState([]);
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [dersKodu, setDersKodu] = useState('');
  const [dersAdi, setDersAdi] = useState('');
  const [aciklama, setAciklama] = useState('');

  const [instructors, setInstructors] = useState([]);
  const [hocaOgrNo, setHocaOgrNo] = useState('');
  const [hocaAdSoyad, setHocaAdSoyad] = useState('');
  const [hocaSifre, setHocaSifre] = useState('');
  const [hocaAuthorizedCourse, setHocaAuthorizedCourse] = useState([]);
  const authHeaders = useMemo(() => (user?.id ? { 'x-user-id': String(user.id) } : {}), [user?.id]);
  const accessibleCourseCodes = useMemo(() => (user?.rol === 'hoca' ? (user.dersler || []) : courses.map(course => course.ders_kodu)), [user?.rol, user?.dersler, courses]);
  const accessibleCourses = useMemo(() => courses.filter(course => accessibleCourseCodes.includes(course.ders_kodu)), [courses, accessibleCourseCodes]);

  const fetchData = useCallback(async () => {
    try {
      const [coursesRes, instructorsRes] = await Promise.all([
        api.courses.list(),
        api.admin.listInstructors(authHeaders)
      ]);

      if (coursesRes.ok) setCourses(coursesRes.data);
      if (instructorsRes.ok) setInstructors(instructorsRes.data);

      if (!selectedCourse) {
        return;
      }

      const [criteriaRes, studentsRes] = await Promise.all([
        api.criteria.listByCourse(selectedCourse),
        api.admin.listAllStudentsStatus(selectedCourse, authHeaders)
      ]);

      if (criteriaRes.ok) setCriteria(criteriaRes.data);

      if (studentsRes.ok) {
        const studentsData = studentsRes.data;
        setAllStudents(Array.isArray(studentsData) ? studentsData.map(student => ({
          id: student.id,
          ogrenci_no: student.ogrenci_no,
          ad_soyad: student.ad_soyad,
          isRegistered: !!student.RegisteredUser,
          alinan_ortalama: student.alinan_ortalama,
          verdigi_ortalama: student.verdigi_ortalama,
          hoca_genel_puani: student.hoca_genel_puani ?? student.hoca_puani ?? null,
          Submission: student.RegisteredUser?.Submissions?.[0] || null
        })) : []);
      }
    } catch (error) {
      console.error('Veri çekme hatası:', error);
    }
  }, [selectedCourse, authHeaders]);

useEffect(() => {
  const fetchLimit = async () => {
    if (!selectedCourse) return;
    try {
      const response = await api.settings.getVideoLimit(selectedCourse, authHeaders);
      const data = response.data;
      
      if (data && data.value !== undefined && data.value !== null) {
        setEvaluationLimit(String(parseInt(data.value, 10)));
      }
    } catch (err) {
      console.error("Limit çekilemedi, varsayılan 3 kullanılıyor:", err);
    }
  };

  fetchLimit();
  fetchData();
}, [fetchData, selectedCourse, authHeaders]);

useEffect(() => {
  if (!accessibleCourseCodes.length) return;

  if (!selectedCourse || !accessibleCourseCodes.includes(selectedCourse)) {
    const firstCourse = accessibleCourseCodes[0];
    setSelectedCourse(firstCourse);
    localStorage.setItem('selectedCourse', firstCourse);
  }
}, [selectedCourse, accessibleCourseCodes]);

// --- EXCEL İLE ÖĞRENCİ LİSTESİ YÜKLEME ---
  const handleUploadClick = () => {
    if (!selectedFile || !uploadCourse) return alert("Ders ve dosya seçiniz!");
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
      sendStudentsToBackend(data, uploadCourse);
      setSelectedFile(null);
      document.getElementById('excelInput').value = "";
    };
    reader.readAsBinaryString(selectedFile);
  };

  const sendStudentsToBackend = async (students, dersKodu) => {
    const res = await api.admin.uploadStudents({ students, secilenDers: dersKodu }, authHeaders);
    if (res.ok) {
      alert("Liste başarıyla işlendi! ✅");
      fetchData();
    }
  };

// --- KRİTER EKLEME ---
  const handleAddCriterion = async (e) => {
    e.preventDefault();
    await api.criteria.create({ kriter_adi: kriterAdi, max_puan: maxPuan, ders_kodu: selectedCourse }, authHeaders);
    setKriterAdi('');
    fetchData();
  };

// --- DERS EKLEME ---
  const handleAddCourse = async (e) => {
    e.preventDefault();
    
    if (!dersKodu.trim() || !dersAdi.trim()) {
      alert("Ders kodu ve adı gereklidir!");
      return;
    }

    try {
      const res = await api.courses.create({ ders_kodu: dersKodu, ders_adi: dersAdi, aciklama }, authHeaders);

      if (res.ok) {
        alert("✅ Ders başarıyla eklendi!");
        setDersKodu('');
        setDersAdi('');
        setAciklama('');
        setIsAddCourseModalOpen(false);
        fetchData();
      } else {
        alert("Hata: " + res.error);
      }
    } catch (error) {
      console.error("Ders ekleme hatası:", error);
      alert("Sunucu hatası");
    }
  };

// --- DERS SİLME ---
  const handleDeleteCourse = async (ders_kodu) => {
    if (!window.confirm(`Bu dersi silmek istediğinizden emin misiniz? (${ders_kodu})`)) {
      return;
    }

    try {
      const res = await api.courses.remove(ders_kodu, authHeaders);

      if (res.ok) {
        alert("✅ Ders silindi!");
        fetchData();
      } else {
        alert("Hata: " + res.error);
      }
    } catch (error) {
      console.error("Ders silme hatası:", error);
      alert("Sunucu hatası");
    }
  };

// --- HOCA EKLEME ---
  const handleAddInstructor = async (e) => {
    e.preventDefault();

    if (!hocaOgrNo.trim() || !hocaAdSoyad.trim() || !hocaSifre.trim() || hocaAuthorizedCourse.length === 0) {
      alert("Lütfen tüm alanları doldurun ve yetkili dersi seçin.");
      return;
    }

    try {
      const res = await api.admin.createInstructor({
        ogrenci_no: hocaOgrNo,
        ad_soyad: hocaAdSoyad,
        sifre: hocaSifre,
        authorized_courses: hocaAuthorizedCourse
      }, authHeaders);

      if (res.ok) {
        alert('✅ Hoca başarıyla eklendi!');
        setHocaOgrNo('');
        setHocaAdSoyad('');
        setHocaSifre('');
        setHocaAuthorizedCourse([]);
        fetchData();
      } else {
        alert('Hata: ' + res.error);
      }
    } catch (error) {
      console.error('Hoca ekleme hatası:', error);
      alert('Sunucu hatası');
    }
  };
// --- HOCA SİL ---
  const handleDeleteInstructor = async (id) => {
    if (!window.confirm('Bu hocayı silmek istediğinizden emin misiniz?')) return;

    try {
      const res = await api.admin.deleteInstructor(id, authHeaders);

      if (res.ok) {
        alert('✅ Hoca silindi!');
        fetchData();
      } else {
        alert('Hata: ' + res.error);
      }
    } catch (error) {
      console.error('Hoca silme hatası:', error);
      alert('Sunucu hatası');
    }
  };

// --- ÖĞRENCİ RAPORU AÇMA ---
  const handleOpenStudentReport = async (student) => {
    if (!student.Submission) {
      alert("Öğrenci henüz video yüklememiş.");
      return;
    }

    setSelectedStudentReport(student);
    setHocaKriterPuanlari({});
    setSubmissionDetail(null);

    try {
      const res = await api.admin.getSubmissionDetail(student.Submission.id, authHeaders);

      if (res.ok) {
        const data = res.data;
        setSubmissionDetail(data);

        if (data.hocaPuanlari?.length > 0) {
          const loaded = {};
          data.hocaPuanlari.forEach((puan) => {
            loaded[puan.criterionId ?? puan.CriterionId ?? puan.id] = puan.puan;
          });
          setHocaKriterPuanlari(loaded);
        }
      }
    } catch (err) {
      console.error("Detay çekme hatası:", err);
    }

    setIsReportModalOpen(true);
  };

// --- KRİTER PUANLARINI KAYDETME ---
  const handleKriterPuanlariKaydet = async (subId) => {
    if (Object.keys(hocaKriterPuanlari).length === 0) {
      alert("Lütfen en az bir kritere puan verin!");
      return;
    }

    const scores = Object.entries(hocaKriterPuanlari).map(([criterionId, puan]) => ({
      criterionId: parseInt(criterionId),
      puan: parseInt(puan)
    }));

    const payload = {
      submissionId: subId,
      userId: user.id,
      puanlananOgrenciId: selectedStudentReport.Submission.UserId,
      scores: scores
    };

    try {
      const res = await api.grades.create(payload);

      if (res.ok) {
        alert("Kriter puanları kaydedildi! ✅");
        setHocaKriterPuanlari({});
        fetchData();
      } else {
        const err = res;
        alert("Hata: " + err.error);
      }
    } catch (error) {
      console.error("Puan kaydetme hatası:", error);
      alert("Sunucu hatası");
    }
  };

  // --- GENEL HOCA PUANI HESAPLAMA ---
  const getGeneralTeacherScore = (detail) => {
    if (!detail) return null;

    if (detail.hoca_genel_puani !== undefined && detail.hoca_genel_puani !== null) {
      return detail.hoca_genel_puani;
    }

    if (detail.hoca_puani !== undefined && detail.hoca_puani !== null) {
      return detail.hoca_puani;
    }

    if (detail.hocaPuanlari?.length > 0) {
      const totals = detail.hocaPuanlari.reduce((acc, puan) => {
        const score = Number(puan.puan);
        const maxScore = Number(puan.max_puan);

        if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
          return acc;
        }

        acc.obtained += score;
        acc.maximum += maxScore;
        return acc;
      }, { obtained: 0, maximum: 0 });

      return totals.maximum ? (totals.obtained / totals.maximum) * 100 : null;
    }

    return null;
  };

  // --- YOUTUBE URL'İNİ EMBED URL'İNE DÖNÜŞTÜRME ---
const getYouTubeEmbedUrl = (url) => {
  if (!url) return null;

  let videoId = null;

  try {
    if (url.includes('youtube.com/watch')) {
      const urlObj = new URL(url);
      videoId = urlObj.searchParams.get('v');
    } 
    else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }
    else if (url.includes('youtube.com/embed/')) {
      videoId = url.split('embed/')[1]?.split('?')[0];
    }
    else if (url.includes('youtube.com/shorts/')) {
      videoId = url.split('shorts/')[1]?.split('?')[0];
    }

    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
    }
  } catch (err) {
    console.error("URL dönüştürme hatası:", err);
  }

  return null;
};

// --- DEĞERLENDİRME LİMİTİNİ GÜNCELLEME ---
const handleLimitUpdate = async () => {
  const parsedLimit = Number(evaluationLimit);

  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
    alert("Lütfen geçerli bir limit girin.");
    return;
  }

  try {
    const response = await api.settings.updateVideoLimit({ limit: parsedLimit, dersKodu: selectedCourse }, authHeaders);

    if (response.ok) {
      const data = response.data;
      setEvaluationLimit(String(parsedLimit));
      alert("✅ " + data.message);
    } else {
      alert("❌ Hata: " + response.error);
    }
  } catch (err) {
    console.error("Güncelleme hatası:", err);
    alert("Sunucuya bağlanılamadı. Backend terminalini kontrol et!");
  }
};

// --- ÖĞRENCİ RAPORUNU EXCEL OLARAK İNDİRME ---
  const exportToExcel = (student) => {
    const genelHocaPuani = getGeneralTeacherScore(submissionDetail);
    const data = [
      ["ÖĞRENCİ PERFORMANS DETAYLI RAPORU"],
      ["Ders:", selectedCourse.toUpperCase()],
      ["Öğrenci:", student.ad_soyad],
      ["Numara:", student.ogrenci_no],
      ["Rapor Tarihi:", new Date().toLocaleDateString('tr-TR')],
      [""]
    ];

    data.push(["GENEL HOCA PUANI"]);
    data.push(["Puan:", genelHocaPuani ?? "Girilmedi"]);
    data.push([""]);

    data.push(["HOCANIN VERDİĞİ KRİTER PUANLARI"]);
    if (submissionDetail?.hocaPuanlari?.length > 0) {
      submissionDetail.hocaPuanlari.forEach((puan) => {
        data.push([puan.kriter_adi, puan.puan, `/ ${puan.max_puan}`]);
      });
      data.push(["Hoca Kriter Ortalaması:", formatAverage(submissionDetail?.istatistikler?.hocaGenelPuani)]);
    } else {
      data.push(["HOCANIN VERDİ?İ KRİTER PUANLARI", "Henüz puanlandırılmamış"]);
    }

    data.push([""]);
    data.push(["HOCADAN ALDIĞI PUANLAR"]);
    if (submissionDetail?.alinanHocaPuanlari?.length > 0) {
      submissionDetail.alinanHocaPuanlari.forEach((puan) => {
        data.push([puan.kriter_adi, puan.puan, `/ ${puan.max_puan}`]);
      });
      data.push(["Hocadan Aldığı Ortalama:", formatAverage(submissionDetail?.istatistikler?.alinanHocaOrtalamasi)]);
    } else {
      data.push(["HOCADAN ALDI?I PUANLAR", "Henüz yok"]);
    }

    data.push([""]);
    data.push(["AKRANLARDAN ALDI?I PUANLAR"]);
    if (submissionDetail?.alinanAkranPuanlari?.length > 0) {
      submissionDetail.alinanAkranPuanlari.forEach((puan) => {
        data.push([puan.kriter_adi, puan.puan, `/ ${puan.max_puan}`]);
      });
      data.push(["Akranlardan Aldığı Ortalama:", formatAverage(submissionDetail?.istatistikler?.alinanAkranOrtalamasi)]);
    } else {
      data.push(["AKRANLARDAN ALDI?I PUANLAR", "Henüz yok"]);
    }

    data.push(["Genel Alınan Ortalama:", formatAverage(submissionDetail?.istatistikler?.alinanGenelOrtalama)]);
    data.push([""]);

    data.push(["Ö?RENCİNİN VERDİ?İ PUANLAR"]);
    if (submissionDetail?.ogrenciVerdigiPuanlar?.length > 0) {
      submissionDetail.ogrenciVerdigiPuanlar.forEach((puan) => {
        data.push([puan.kriter_adi, puan.puan, `/ ${puan.max_puan}`]);
      });
      data.push(["Öğrencinin Verdiği Ortalama:", formatAverage(submissionDetail?.istatistikler?.verdigiOrtalama)]);
    } else {
      data.push(["Ö?RENCİNİN VERDİ?İ PUANLAR", "Henüz başkasını puanlamamış"]);
    }

    data.push([""]);
    data.push(["ÖZET BİLGİLER"]);
    data.push(["Proje Açıklaması:", submissionDetail?.proje_aciklamasi || "Yok"]);
    data.push(["Video URL:", submissionDetail?.video_url || "Yok"]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detayli Rapor");
    XLSX.writeFile(wb, `${student.ogrenci_no}_Detayli_Rapor_${new Date().getTime()}.xlsx`);
  };


  const exportUnregisteredStudentsToExcel = () => {
    const unregisteredStudents = allStudents.filter(s => !s.isRegistered);
    
    if (unregisteredStudents.length === 0) {
      alert("Kaydolmayan öğrenci bulunmamaktadır.");
      return;
    }

    const data = [
      ["KAYDOLMAYAN Ö?RENCİ LİSTESİ"],
      ["Ders:", selectedCourse.toUpperCase()],
      ["Tarih:", new Date().toLocaleDateString('tr-TR')],
      ["Toplam:", unregisteredStudents.length],
      [""],
      ["Öğrenci No", "Ad Soyad"]
    ];

    unregisteredStudents.forEach(student => {
      data.push([student.ogrenci_no, student.ad_soyad]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kaydolmayanlar");
    XLSX.writeFile(wb, `Kaydolmayan_Ogrenciler_${selectedCourse}_${new Date().getTime()}.xlsx`);
  };

  const filteredList = allStudents.filter(student => {
    if (filterStatus === 'not_registered') return !student.isRegistered;
    if (filterStatus === 'no_video') return student.isRegistered && !student.Submission;
    return true;
  });

  const formatAverage = (value) => Number(value || 0).toFixed(2);


  // --- STİL OBJEKTLERİ ---
  return (
    <div style={{ padding: '30px', backgroundColor: '#f4f7f6', minHeight: '100vh', fontFamily: 'Segoe UI' }}>
      
          
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', backgroundColor: '#fff', padding: '15px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h2 style={{ margin: 0 }}>Hoca Paneli</h2>
          
          <select 
            value={selectedCourse} 
            onChange={(e) => {
              const ders = e.target.value;
              setSelectedCourse(ders);
              localStorage.setItem('selectedCourse', ders);
            }}
            style={{ padding: '8px', borderRadius: '5px', border: '1px solid #3498db', fontWeight: 'bold', color: '#3498db' }}
          >
            <option value="">--- Ders Seçin ---</option>
            {accessibleCourses.map(course => (
              <option key={course.ders_kodu} value={course.ders_kodu}>
                {course.ders_adi}
              </option>
            ))}
          </select>
        </div>

        <div>
          <button onClick={() => { localStorage.clear(); navigate('/login'); }} style={btnStyle('#e74c3c')}>Çıkış Yap</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: '20px' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={cardStyle}>
            <h4>⚙️ Puanlama Sınırı</h4>
            <input type="number" min="1" value={evaluationLimit} onChange={(e) => setEvaluationLimit(e.target.value)} style={inputStyle} />
            <button type="button" onClick={handleLimitUpdate} style={btnStyle('#f39c12', '100%')}>Limiti Güncelle</button>
          </div>

          <div style={cardStyle}>
            <h4> Öğrenci Listesi Yükle</h4>
            <select value={uploadCourse} onChange={(e) => setUploadCourse(e.target.value)} style={inputStyle}>
              <option value="">--- Ders Seçin ---</option>
              {accessibleCourses.map(course => (
                <option key={course.ders_kodu} value={course.ders_kodu}>
                  {course.ders_adi}
                </option>
              ))}
            </select>
            <input id="excelInput" type="file" accept=".xlsx, .xls" onChange={(e) => setSelectedFile(e.target.files[0])} style={{marginBottom:'10px', fontSize:'12px'}} />
            <button onClick={handleUploadClick} disabled={!selectedFile} style={btnStyle(selectedFile ? '#27ae60' : '#ccc', '100%')}>Listeyi İşle</button>
          </div>

          <div style={cardStyle}>
            <h4> ️ Yeni Kriter Ekle</h4>
            <form onSubmit={handleAddCriterion}>
              <input type="text" placeholder="Kriter Adı" value={kriterAdi} onChange={(e) => setKriterAdi(e.target.value)} style={inputStyle} required />
              <input type="number" placeholder="Max Puan" value={maxPuan} onChange={(e) => setMaxPuan(e.target.value)} style={inputStyle} required />
              <button type="submit" style={btnStyle('#3498db', '100%')}>Kriteri Kaydet</button>
            </form>
          </div>
        </div>

        <div style={cardStyle}>
          <h3>  Tüm Öğrenci Takip Listesi</h3>
          <div style={{marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div>
              <button onClick={() => setFilterStatus('all')} style={filterBtnStyle(filterStatus === 'all')}>Hepsi</button>
              <button onClick={() => setFilterStatus('not_registered')} style={filterBtnStyle(filterStatus === 'not_registered')}>Kaydolmayanlar</button>
              <button onClick={() => setFilterStatus('no_video')} style={filterBtnStyle(filterStatus === 'no_video')}>Video Yüklemeyenler</button>
            </div>
            {filterStatus === 'not_registered' && (
              <button onClick={exportUnregisteredStudentsToExcel} style={btnStyle('#27ae60')}>  Listeyi İndir</button>
            )}
          </div>
          
          <table style={{width: '100%', fontSize: '14px', borderCollapse:'collapse'}}>
            <thead>
              <tr style={{textAlign:'left', borderBottom:'2px solid #eee'}}>
                <th style={{padding:'10px'}}>Öğrenci No</th>
                <th style={{padding:'10px'}}>Ad Soyad </th>
                <th style={{padding:'10px'}}>Durum</th>
                <th style={{padding:'10px'}}>Aldığı Puan Ort.</th>
                <th style={{padding:'10px'}}>Verdiği Puan Ort.</th>
                <th style={{padding:'10px'}}>Genel Hoca Puanı</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map(s => (
                <tr key={s.id} style={{borderBottom:'1px solid #f9f9f9'}}>
                  <td style={{padding:'10px'}}>{s.ogrenci_no}</td>
                  <td 
                    onClick={() => handleOpenStudentReport(s)}
                    style={{padding:'10px', cursor:'pointer', color:'#2980b9', fontWeight:'bold', textDecoration:'underline'}}
                  >
                    {s.ad_soyad}
                  </td>
                  <td style={{padding:'10px'}}>
                    {!s.isRegistered ? <span style={{color:'red'}}>❌ Kayıtsız</span> : 
                     !s.Submission ? <span style={{color:'orange'}}>⚠️ Video Yok</span> : 
                     <span style={{color:'green'}}>✅ Tamam</span>}
                  </td>
                  <td style={{padding:'10px'}}>{s.alinan_ortalama != null ? formatAverage(s.alinan_ortalama) : "---"}</td>
                  <td style={{padding:'10px'}}>{s.verdigi_ortalama != null ? formatAverage(s.verdigi_ortalama) : "---"}</td>
                  <td style={{padding:'10px', fontWeight:'bold'}}>{s.hoca_genel_puani ?? "---"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '25px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={cardStyle}>
          <h4>  Ders Yönetimi</h4>
          <button onClick={() => setIsAddCourseModalOpen(true)} style={btnStyle('#2ecc71', '100%', '10px')}>+ Yeni Ders Ekle</button>
          
          {courses.length > 0 ? (
            <div style={{ marginTop: '15px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '13px' }}>Mevcut Dersler:</p>
              {accessibleCourses.map(course => (
                <div key={course.ders_kodu} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px', backgroundColor:'#ecf0f1', borderRadius:'5px', marginBottom:'8px', fontSize:'13px' }}>
                  <div>
                    <strong>{course.ders_adi}</strong>
                    <p style={{ margin:'4px 0 0 0', color:'#7f8c8d', fontSize:'12px' }}>{course.ders_kodu}</p>
                  </div>
                  <button 
                    onClick={() => handleDeleteCourse(course.ders_kodu)}
                    style={{ padding:'5px 10px', backgroundColor:'#e74c3c', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'12px' }}
                  >
                    Sil
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color:'#7f8c8d', marginTop:'10px', fontSize:'13px' }}>Henüz ders eklenmemiş</p>
          )}
        </div>

        <div style={cardStyle}>
          <h4> ‍  Yetkili Hoca Ekleyin</h4>
          <form onSubmit={handleAddInstructor}>
            <input
              type="text"
              placeholder="Hoca Kullanıcı Adı (Giriş Yapmak İçin Kullanılır)"
              value={hocaOgrNo}
              onChange={(e) => setHocaOgrNo(e.target.value)}
              style={{ ...inputStyle, minHeight: '120px' }}
              required
            />
            <input
              type="text"
              placeholder="Hoca Ad Soyad"
              value={hocaAdSoyad}
              onChange={(e) => setHocaAdSoyad(e.target.value)}
              style={{ ...inputStyle, minHeight: '120px' }}
              required
            />
            <input
              type="password"
              placeholder="?ifre"
              value={hocaSifre}
              onChange={(e) => setHocaSifre(e.target.value)}
              style={{ ...inputStyle, minHeight: '120px' }}
              required
            />
            <select
              multiple
              value={hocaAuthorizedCourse}
              onChange={(e) => setHocaAuthorizedCourse(Array.from(e.target.selectedOptions, option => option.value))}
              style={{ ...inputStyle, minHeight: '120px' }}
              required
            >
              <option value="">--- Yetkili Ders Seçin ---</option>
              {accessibleCourses.map(course => (
                <option key={course.ders_kodu} value={course.ders_kodu}>
                  {course.ders_adi} ({course.ders_kodu})
                </option>
              ))}
            </select>
            <button type="submit" style={btnStyle('#8e44ad', '100%')}>Hoca Ekle</button>
          </form>

          <div style={{ marginTop: '15px' }}>
            <p style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '13px' }}>Kayıtlı Hocalar</p>
            {instructors.length > 0 ? (
              instructors.map(inst => (
                <div key={inst.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed #ddd' }}>
                  <div>
                    <strong>{inst.ad_soyad}</strong>
                    <p style={{ margin: '4px 0 0 0', color: '#7f8c8d', fontSize: '12px' }}>
                      {inst.ogrenci_no} | {(inst.authorized_courses || (inst.authorized_course || '').split(',').filter(Boolean)).join(', ')}
                    </p>
                  </div>
                  {user?.is_admin && (
                    <button onClick={() => handleDeleteInstructor(inst.id)} style={{ ...btnStyle('#e74c3c', 'auto'), padding: '6px 10px', marginLeft: '10px' }}>
                      Sil
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p style={{ color: '#7f8c8d', fontSize: '13px' }}>Henüz hoca tanımlanmadı.</p>
            )}
          </div>
        </div>
      </div>

      {isReportModalOpen && selectedStudentReport && (
        <div style={modalOverlayStyle}>
          <div style={{...modalContentStyle, maxWidth: '1100px', height: '90vh', overflowY: 'auto'}}>
            <div style={{display:'flex', justifyContent:'space-between', borderBottom:'1px solid #eee', paddingBottom:'10px', marginBottom:'20px'}}>
                <h3>  Öğrenci Detay Raporu</h3>
                <button onClick={() => setIsReportModalOpen(false)} style={{border:'none', background:'none', cursor:'pointer', fontSize:'20px'}}>✕</button>
            </div>
            
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginBottom:'20px'}}>
              <div style={{backgroundColor:'#f9f9f9', padding:'15px', borderRadius:'8px'}}>
                <h4 style={{marginTop: 0}}> Proje Videosu</h4>
                {selectedStudentReport.Submission?.video_url && getYouTubeEmbedUrl(selectedStudentReport.Submission.video_url) ? (
                  <iframe
                    width="100%"
                    height="300"
                    src={getYouTubeEmbedUrl(selectedStudentReport.Submission.video_url)}
                    title="Öğrenci Videosu"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{borderRadius: '8px'}}
                  />
                ) : (
                  <div style={{backgroundColor: '#fff', padding: '20px', textAlign: 'center', borderRadius: '8px', color: '#999'}}>
                      Video bulunamadı
                  </div>
                )}
                <p style={{marginTop: '10px', fontSize: '12px', color: '#666'}}>
                  <b>Video URL:</b> {selectedStudentReport.Submission?.video_url || "Yok"}
                </p>
              </div>

              <div>
                <div style={{backgroundColor:'#f9f9f9', padding:'15px', borderRadius:'8px', marginBottom:'15px'}}>
                  <p><b>Öğrenci:</b> {selectedStudentReport.ad_soyad}</p>
                  <p><b>No:</b> {selectedStudentReport.ogrenci_no}</p>
                  <p><b>Aldigi Ortalama Puan:</b> {formatAverage(submissionDetail?.istatistikler?.alinanGenelOrtalama)}</p>
                  <p><b>Verdigi Ortalama Puan:</b> {formatAverage(submissionDetail?.istatistikler?.verdigiOrtalama)}</p>
                  <p><b>Akran Ortalaması:</b> {formatAverage(submissionDetail?.istatistikler?.alinanAkranOrtalamasi)}</p>
                  <p><b>Genel Hoca Puanı:</b> {getGeneralTeacherScore(submissionDetail) ?? "Girilmedi"}</p>
                </div>

                <div style={{backgroundColor:'#fff3cd', padding:'15px', borderRadius:'8px', marginBottom:'15px'}}>
                  <label><b>  Proje Açıklaması:</b></label>
                  <p style={{backgroundColor:'#fff', padding:'10px', borderRadius:'5px', minHeight:'80px'}}>
                    {selectedStudentReport.Submission?.proje_aciklamasi || "Açıklama girilmemiş"}
                  </p>
                </div>

                <button onClick={() => exportToExcel(selectedStudentReport)} style={{...btnStyle('#2c3e50'), marginTop:'15px', width:'100%'}}>  Excel Raporu Al</button>
              </div>
            </div>

            {submissionDetail && (
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginBottom:'20px'}}>
                <div style={{backgroundColor:'#f8fbff', padding:'15px', borderRadius:'8px', border:'1px solid #d6eaff'}}>
                  <h4 style={{marginTop:0}}>Öğrencilerden Aldığı Puanlar</h4>
                  <p><b>Öğrenci Ortalaması:</b> {formatAverage(submissionDetail?.istatistikler?.alinanAkranOrtalamasi)}</p>
                  <p><b>Genel Ortalama:</b> {formatAverage(submissionDetail?.istatistikler?.alinanGenelOrtalama)}</p>
                  <div style={{maxHeight:'130px', overflowY:'auto', marginTop:'10px', padding:'10px', backgroundColor:'#fff', borderRadius:'6px', border:'1px solid #eef4fb'}}>
                    {submissionDetail.alinanAkranPuanlari?.length > 0 ? submissionDetail.alinanAkranPuanlari.map(puan => (
                      <div key={`alinan-akran-${puan.id}`} style={{padding:'8px', backgroundColor:'#fff', borderRadius:'6px', marginBottom:'8px', border:'1px solid #eef4fb'}}>
                        <div style={{fontWeight:'bold'}}>{puan.kriter_adi || 'Kriter'}</div>
                        <div>{puan.puan} / {puan.max_puan || '-'}</div>
                        <div style={{fontSize:'12px', color:'#666'}}>Veren: {puan.veren || '-'} ({puan.verenRol === 'hoca' ? 'Hoca' : 'Öğrenci'})</div>
                      </div>
                    )) : <p style={{color:'#7f8c8d', margin:0}}>Akran puanı yok.</p>}
                  </div>
                </div>

                <div style={{backgroundColor:'#fffaf2', padding:'15px', borderRadius:'8px', border:'1px solid #f3dfb0'}}>
                  <h4 style={{marginTop:0}}>Verdigi Puanlar</h4>
                  <p><b>Verdigi Ortalama:</b> {formatAverage(submissionDetail?.istatistikler?.verdigiOrtalama)}</p>
                  <div style={{maxHeight:'220px', overflowY:'auto', marginTop:'10px'}}>
                    {submissionDetail.ogrenciVerdigiPuanlar?.length > 0 ? submissionDetail.ogrenciVerdigiPuanlar.map(puan => (
                      <div key={`verdigi-${puan.id}`} style={{padding:'10px', backgroundColor:'#fff', borderRadius:'6px', marginBottom:'8px', border:'1px solid #f8edd1'}}>
                        <div style={{fontWeight:'bold'}}>{puan.kriter_adi || 'Kriter'}</div>
                        <div>{puan.puan} / {puan.max_puan || '-'}</div>
                        <div style={{fontSize:'12px', color:'#666'}}>Puanlanan: {puan.puanlananOgrenci || '-'} ({puan.puanlananOgrenciNo || '-'})</div>
                      </div>
                    )) : <p style={{color:'#7f8c8d'}}>Henuz baskalarina puan vermemis.</p>}
                  </div>
                </div>
              </div>
            )}

            {criteria.length > 0 && (
              <div style={{marginTop: '20px', borderTop: '2px solid #eee', paddingTop: '20px'}}>
                <h4>⭐ Kriterlere Puan Ver</h4>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px'}}>
                  {criteria.map(criterion => (
                    <div key={criterion.id} style={{backgroundColor: '#f0f8ff', padding: '15px', borderRadius: '8px', border: '1px solid #b3d9ff'}}>
                      <label style={{fontWeight: 'bold', display: 'block', marginBottom: '8px'}}>
                        {criterion.kriter_adi}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={criterion.max_puan}
                        placeholder={`Maks: ${criterion.max_puan}`}
                        value={hocaKriterPuanlari[criterion.id] || ''}
                        onChange={(e) => setHocaKriterPuanlari({
                          ...hocaKriterPuanlari,
                          [criterion.id]: e.target.value
                        })}
                        style={{...inputStyle, marginBottom: '0'}}
                      />
                      <small style={{color: '#666'}}>Max: {criterion.max_puan}</small>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => handleKriterPuanlariKaydet(selectedStudentReport.Submission.id)} 
                  style={{...btnStyle('#ff6b6b'), marginTop: '15px', width: '100%'}}
                >
                    Kriter Puanlarını Kaydet
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isAddCourseModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>  Yeni Ders Ekle</h3>
              <button 
                onClick={() => {
                  setIsAddCourseModalOpen(false);
                  setDersKodu('');
                  setDersAdi('');
                  setAciklama('');
                }}
                style={{ fontSize: '24px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleAddCourse}>
              <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Ders Kodu *</label>
                <input 
                  type="text" 
                  placeholder="örn: internet_programlama"
                  value={dersKodu} 
                  onChange={(e) => setDersKodu(e.target.value.toLowerCase())} 
                  style={inputStyle} 
                  required 
                />
              </div>

              <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Ders Adı *</label>
                <input 
                  type="text" 
                  placeholder="örn: İnternet Programcılığı"
                  value={dersAdi} 
                  onChange={(e) => setDersAdi(e.target.value)} 
                  style={inputStyle} 
                  required 
                />
              </div>

              <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Açıklama</label>
                <textarea 
                  placeholder="Ders açıklaması yazınız..."
                  value={aciklama} 
                  onChange={(e) => setAciklama(e.target.value)} 
                  style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '5px', border: '1px solid #ddd', boxSizing: 'border-box', minHeight: '80px', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button 
                  type="button"
                  onClick={() => {
                    setIsAddCourseModalOpen(false);
                    setDersKodu('');
                    setDersAdi('');
                    setAciklama('');
                  }}
                  style={btnStyle('#95a5a6')}
                >
                  İptal
                </button>
                <button 
                  type="submit"
                  style={btnStyle('#2ecc71')}
                >
                  ✓ Ders Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const cardStyle = { backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' };
const inputStyle = { width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '5px', border: '1px solid #ddd', boxSizing: 'border-box' };
const btnStyle = (color, width = 'auto', marginTop = '0') => ({ backgroundColor: color, color: 'white', border: 'none', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', width: width, fontWeight: 'bold', marginLeft: width === 'auto' ? '10px' : '0', marginTop: marginTop });
const filterBtnStyle = (isActive) => ({ backgroundColor: isActive ? '#3498db' : '#ecf0f1', color: isActive ? 'white' : '#2c3e50', border: 'none', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', marginRight: '5px' });
const modalOverlayStyle = { position:'fixed', top:0, left:0, width:'100%', height:'100%', backgroundColor:'rgba(0,0,0,0.7)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000, padding: '10px' };
const modalContentStyle = { backgroundColor:'#fff', padding:'30px', borderRadius:'15px', width:'95%', maxWidth: '1000px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' };

export default AdminPanel;
