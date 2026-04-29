import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { api } from '../services/api';

const fmtAvg = (v) => (v != null ? Number(v).toFixed(1) : '—');

export default function AdminPanel() {
  const navigate = useNavigate();
  const user = useMemo(() => JSON.parse(localStorage.getItem('user') || 'null'), []);

  const [selectedCourse, setSelectedCourse] = useState(localStorage.getItem('selectedCourse') || '');
  const [courses, setCourses] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [criteria, setCriteria] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [evaluationLimit, setEvaluationLimit] = useState('');

  // Formlar
  const [kriterAdi, setKriterAdi] = useState('');
  const [maxPuan, setMaxPuan] = useState(100);
  const [uploadCourse, setUploadCourse] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [courseForm, setCourseForm] = useState({ ders_kodu: '', ders_adi: '', aciklama: '' });
  const [hocaForm, setHocaForm] = useState({ ogrenci_no: '', ad_soyad: '', sifre: '', authorized_courses: [] });

  // Modallar
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [reportModal, setReportModal] = useState(null);
  const [submissionDetail, setSubmissionDetail] = useState(null);
  const [hocaPuanlari, setHocaPuanlari] = useState({});

  // Yükleme
  const [saving, setSaving] = useState(false);

  const authHeaders = useMemo(() => (user?.id ? { 'x-user-id': String(user.id) } : {}), [user]);

  const accessibleCodes = useMemo(() => {
    if (user?.is_admin) return courses.map(c => c.ders_kodu);
    return user?.rol === 'hoca' ? (user.dersler || []) : [];
  }, [user, courses]);

  const accessibleCourses = useMemo(() =>
    courses.filter(c => accessibleCodes.includes(c.ders_kodu)), [courses, accessibleCodes]);

  const fetchData = useCallback(async () => {
    try {
      const [cRes, iRes] = await Promise.all([api.courses.list(), api.admin.listInstructors(authHeaders)]);
      if (cRes.ok) setCourses(cRes.data);
      if (iRes.ok) setInstructors(iRes.data);
      if (!selectedCourse) return;
      const [krRes, stRes] = await Promise.all([
        api.criteria.listByCourse(selectedCourse),
        api.admin.listAllStudentsStatus(selectedCourse, authHeaders),
      ]);
      if (krRes.ok) setCriteria(krRes.data);
      if (stRes.ok) {
        setAllStudents((stRes.data || []).map(s => ({
          id: s.id, ogrenci_no: s.ogrenci_no, ad_soyad: s.ad_soyad,
          isRegistered: !!s.RegisteredUser,
          alinan_ortalama: s.alinan_ortalama,
          verdigi_ortalama: s.verdigi_ortalama,
          hoca_genel_puani: s.hoca_genel_puani ?? null,
          Submission: s.RegisteredUser?.Submissions?.[0] || null,
        })));
      }
    } catch (err) { console.error(err); }
  }, [selectedCourse, authHeaders]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const fetchLimit = async () => {
      if (!selectedCourse) return;
      const r = await api.settings.getVideoLimit(selectedCourse, authHeaders);
      if (r.ok && r.data?.value) setEvaluationLimit(String(parseInt(r.data.value)));
    };
    fetchLimit();
    fetchData();
  }, [fetchData, selectedCourse, user]);

  useEffect(() => {
    if (!accessibleCodes.length) return;
    if (!selectedCourse || !accessibleCodes.includes(selectedCourse)) {
      const first = accessibleCodes[0];
      if (first) { setSelectedCourse(first); localStorage.setItem('selectedCourse', first); }
    }
  }, [accessibleCodes, selectedCourse]);

  // ── Ders Ekleme ────────────────────────────────────────────────────────────
  const handleAddCourse = async (e) => {
    e.preventDefault();
    if (!courseForm.ders_kodu.trim() || !courseForm.ders_adi.trim()) { alert('Ders kodu ve adı gereklidir!'); return; }
    setSaving(true);
    try {
      const r = await api.courses.create(courseForm, authHeaders);
      if (r.ok) { setShowCourseModal(false); setCourseForm({ ders_kodu: '', ders_adi: '', aciklama: '' }); fetchData(); }
      else alert(r.error);
    } finally { setSaving(false); }
  };

  const handleDeleteCourse = async (kod) => {
    if (!window.confirm(`"${kod}" dersini silmek istiyor musunuz?`)) return;
    const r = await api.courses.remove(kod, authHeaders);
    if (r.ok) fetchData(); else alert(r.error);
  };

  // ── Kriter Ekleme ─────────────────────────────────────────────────────────
  const handleAddCriterion = async (e) => {
    e.preventDefault();
    await api.criteria.create({ kriter_adi: kriterAdi, max_puan: parseInt(maxPuan), ders_kodu: selectedCourse }, authHeaders);
    setKriterAdi(''); setMaxPuan(100); fetchData();
  };

  // ── Öğrenci Listesi Yükleme ───────────────────────────────────────────────
  const handleUpload = () => {
    if (!selectedFile || !uploadCourse) { alert('Ders ve dosya seçiniz!'); return; }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      api.admin.uploadStudents({ students: data, secilenDers: uploadCourse }, authHeaders)
        .then(r => { if (r.ok) { alert('Liste işlendi! ✅'); fetchData(); } else alert(r.error); });
      setSelectedFile(null);
      document.getElementById('excelInput').value = '';
    };
    reader.readAsBinaryString(selectedFile);
  };

  // ── Hoca Ekleme ───────────────────────────────────────────────────────────
  const handleAddInstructor = async (e) => {
    e.preventDefault();
    if (!hocaForm.ogrenci_no || !hocaForm.ad_soyad || !hocaForm.sifre || !hocaForm.authorized_courses.length) {
      alert('Tüm alanları doldurun.'); return;
    }
    setSaving(true);
    try {
      const r = await api.admin.createInstructor(hocaForm, authHeaders);
      if (r.ok) { setHocaForm({ ogrenci_no: '', ad_soyad: '', sifre: '', authorized_courses: [] }); fetchData(); alert('✅ Hoca eklendi!'); }
      else alert(r.error);
    } finally { setSaving(false); }
  };

  const handleDeleteInstructor = async (id) => {
    if (!window.confirm('Bu hocayı silmek istiyor musunuz?')) return;
    const r = await api.admin.deleteInstructor(id, authHeaders);
    if (r.ok) { fetchData(); } else alert(r.error);
  };

  // ── Öğrenci Raporu ────────────────────────────────────────────────────────
  const openReport = async (student) => {
    if (!student.Submission) { alert('Öğrenci henüz video yüklememiş.'); return; }
    setReportModal(student);
    setHocaPuanlari({});
    setSubmissionDetail(null);
    try {
      const r = await api.admin.getSubmissionDetail(student.Submission.id, authHeaders);
      if (r.ok) {
        setSubmissionDetail(r.data);
        const loaded = {};
        (r.data.hocaPuanlari || []).forEach(p => { loaded[p.criterionId ?? p.id] = p.puan; });
        setHocaPuanlari(loaded);
      } else {
        console.error('Submission detail hatası:', r.error);
      }
    } catch (err) {
      console.error('Rapor yüklenemedi:', err);
    }
  };

  const saveHocaPuanlari = async () => {
    if (!Object.keys(hocaPuanlari).length) { alert('En az bir kritere puan verin!'); return; }
    const r = await api.grades.create({
      submissionId: reportModal.Submission.id, userId: user.id,
      puanlananOgrenciId: reportModal.Submission.userId,
      scores: Object.entries(hocaPuanlari).map(([id, p]) => ({ criterionId: parseInt(id), puan: parseInt(p) })),
    });
    if (r.ok) { alert('Puanlar kaydedildi! ✅'); fetchData(); }
    else alert(r.error);
  };

  const exportExcel = () => {
    if (!submissionDetail || !reportModal) return;
    const d = submissionDetail;
    const rows = [
      ['ÖĞRENCI RAPORU'], ['Ders:', selectedCourse], ['Öğrenci:', reportModal.ad_soyad], ['No:', reportModal.ogrenci_no], [''],
      ['Aldığı Ortalama:', fmtAvg(d.istatistikler?.alinanGenelOrtalama)],
      ['Akran Ortalaması:', fmtAvg(d.istatistikler?.alinanAkranOrtalamasi)],
      ['Hoca Puanı:', fmtAvg(d.istatistikler?.hocaGenelPuani)],
      ['Verdiği Ortalama:', fmtAvg(d.istatistikler?.verdigiOrtalama)],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rapor');
    XLSX.writeFile(wb, `${reportModal.ogrenci_no}_Rapor.xlsx`);
  };

  const getEmbedUrl = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|watch\?v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}?rel=0` : null;
  };

  const filtered = allStudents.filter(s => {
    if (filterStatus === 'not_registered') return !s.isRegistered;
    if (filterStatus === 'no_video') return s.isRegistered && !s.Submission;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary-800 text-white shadow-lg sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="font-semibold hidden sm:block">🏫 Hoca Paneli</span>
            <select
              value={selectedCourse}
              onChange={e => { setSelectedCourse(e.target.value); localStorage.setItem('selectedCourse', e.target.value); }}
              className="bg-primary-700 border border-primary-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              <option value="">— Ders Seçin —</option>
              {accessibleCourses.map(c => <option key={c.ders_kodu} value={c.ders_kodu}>{c.ders_adi}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-primary-200 text-sm hidden md:block">{user?.ad_soyad}</span>
            <button onClick={() => { localStorage.clear(); navigate('/login'); }}
              className="text-sm text-primary-200 hover:text-white transition-colors">Çıkış</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Üst kart satırı */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Puanlama limiti */}
          <div className="card p-5">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">⚙️ Puanlama Limiti</h4>
            <input type="number" min="1" className="input-field mb-3" value={evaluationLimit} onChange={e => setEvaluationLimit(e.target.value)} />
            <button onClick={async () => {
              const r = await api.settings.updateVideoLimit({ limit: parseInt(evaluationLimit), dersKodu: selectedCourse }, authHeaders);
              if (r.ok) alert('✅ ' + r.data.message); else alert('❌ ' + r.error);
            }} className="btn-primary w-full">Güncelle</button>
          </div>

          {/* Öğrenci Listesi Yükleme */}
          <div className="card p-5">
            <h4 className="font-semibold text-gray-800 mb-3">📋 Öğrenci Listesi Yükle</h4>
            <select className="input-field mb-2" value={uploadCourse} onChange={e => setUploadCourse(e.target.value)}>
              <option value="">— Ders Seçin —</option>
              {accessibleCourses.map(c => <option key={c.ders_kodu} value={c.ders_kodu}>{c.ders_adi}</option>)}
            </select>
            <input id="excelInput" type="file" accept=".xlsx,.xls" className="text-sm mb-2 w-full"
              onChange={e => setSelectedFile(e.target.files[0])} />
            <button onClick={handleUpload} disabled={!selectedFile} className="btn-primary w-full">Listeyi İşle</button>
          </div>

          {/* Kriter Ekle */}
          <div className="card p-5">
            <h4 className="font-semibold text-gray-800 mb-3">🎯 Kriter Ekle</h4>
            <form onSubmit={handleAddCriterion} className="space-y-2">
              <input className="input-field" placeholder="Kriter adı" value={kriterAdi} onChange={e => setKriterAdi(e.target.value)} required />
              <input type="number" className="input-field" placeholder="Max puan" value={maxPuan} onChange={e => setMaxPuan(e.target.value)} required />
              <button type="submit" className="btn-primary w-full">Ekle</button>
            </form>
            {criteria.length > 0 && (
              <div className="mt-3 space-y-1">
                {criteria.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-100">
                    <span className="text-gray-700">{c.kriter_adi}</span>
                    <span className="badge-blue">/{c.max_puan}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Öğrenci Tablosu */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-gray-900">📊 Öğrenci Takip Listesi</h3>
              <span className="bg-primary-100 text-primary-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                {filtered.length} / {allStudents.length} öğrenci
              </span>
            </div>
            <div className="flex gap-2">
              {['all', 'not_registered', 'no_video'].map(f => (
                <button key={f} onClick={() => setFilterStatus(f)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${filterStatus === f ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {f === 'all' ? 'Tümü' : f === 'not_registered' ? 'Kayıtsız' : 'Video Yok'}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-3 text-center w-10">#</th>
                  <th className="px-4 py-3 text-left">Öğrenci No</th>
                  <th className="px-4 py-3 text-left">Ad Soyad</th>
                  <th className="px-4 py-3 text-left">Durum</th>
                  <th className="px-4 py-3 text-right">Aldığı Ort.</th>
                  <th className="px-4 py-3 text-right">Verdiği Ort.</th>
                  <th className="px-4 py-3 text-right">Hoca Puanı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Öğrenci bulunamadı.</td></tr>
                ) : filtered.map((s, i) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 text-center text-xs font-medium text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.ogrenci_no}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openReport(s)} className="font-medium text-primary-600 hover:text-primary-800 hover:underline text-left">
                        {s.ad_soyad}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {!s.isRegistered ? <span className="badge-red">Kayıtsız</span>
                        : !s.Submission ? <span className="badge-amber">Video Yok</span>
                        : <span className="badge-green">Tamam</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtAvg(s.alinan_ortalama)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtAvg(s.verdigi_ortalama)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{s.hoca_genel_puani != null ? Number(s.hoca_genel_puani).toFixed(1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alt Kart Satırı: Ders Yönetimi + Hoca Yönetimi */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Ders Yönetimi */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-gray-900">📚 Ders Yönetimi</h4>
              <button onClick={() => setShowCourseModal(true)} className="btn-primary text-xs py-1.5 px-3">+ Ders Ekle</button>
            </div>
            <div className="space-y-2">
              {accessibleCourses.length === 0 ? (
                <p className="text-sm text-gray-400">Henüz ders eklenmemiş.</p>
              ) : accessibleCourses.map(c => (
                <div key={c.ders_kodu} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{c.ders_adi}</div>
                    <div className="text-xs text-gray-400 font-mono">{c.ders_kodu}</div>
                  </div>
                  <button onClick={() => handleDeleteCourse(c.ders_kodu)}
                    className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-50 transition-colors">
                    Sil
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Hoca Yönetimi */}
          <div className="card p-5">
            <h4 className="font-semibold text-gray-900 mb-4">👩‍🏫 Hoca Yönetimi</h4>
            <form onSubmit={handleAddInstructor} className="space-y-2 mb-4 pb-4 border-b border-gray-100">
              <input className="input-field" placeholder="Kullanıcı adı" value={hocaForm.ogrenci_no} onChange={e => setHocaForm({ ...hocaForm, ogrenci_no: e.target.value })} required />
              <input className="input-field" placeholder="Ad Soyad" value={hocaForm.ad_soyad} onChange={e => setHocaForm({ ...hocaForm, ad_soyad: e.target.value })} required />
              <input className="input-field" type="password" placeholder="Şifre" value={hocaForm.sifre} onChange={e => setHocaForm({ ...hocaForm, sifre: e.target.value })} required />
              <select multiple className="input-field" style={{ minHeight: '90px' }}
                value={hocaForm.authorized_courses}
                onChange={e => setHocaForm({ ...hocaForm, authorized_courses: Array.from(e.target.selectedOptions, o => o.value) })}
                required>
                {accessibleCourses.map(c => <option key={c.ders_kodu} value={c.ders_kodu}>{c.ders_adi} ({c.ders_kodu})</option>)}
              </select>
              <button type="submit" disabled={saving} className="btn-primary w-full">Hoca Ekle</button>
            </form>
            <div className="space-y-2">
              {instructors.length === 0 ? <p className="text-sm text-gray-400">Henüz hoca tanımlanmadı.</p>
                : instructors.map(i => (
                  <div key={i.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{i.ad_soyad}</div>
                      <div className="text-xs text-gray-400">{i.ogrenci_no} | {(i.authorized_courses || []).join(', ') || '—'}</div>
                    </div>
                    {user?.is_admin && (
                      <button onClick={() => handleDeleteInstructor(i.id)}
                        className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-50 transition-colors ml-3">
                        Sil
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ders Ekleme Modalı */}
      {showCourseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCourseModal(false)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">Yeni Ders Ekle</h3>
              <button onClick={() => setShowCourseModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleAddCourse} className="space-y-4">
              <div>
                <label className="label">Ders Kodu *</label>
                <input className="input-field" placeholder="örn: web_programlama"
                  value={courseForm.ders_kodu} onChange={e => setCourseForm({ ...courseForm, ders_kodu: e.target.value.toLowerCase() })} required />
              </div>
              <div>
                <label className="label">Ders Adı *</label>
                <input className="input-field" placeholder="örn: Web Programlama"
                  value={courseForm.ders_adi} onChange={e => setCourseForm({ ...courseForm, ders_adi: e.target.value })} required />
              </div>
              <div>
                <label className="label">Açıklama</label>
                <textarea className="input-field" rows={2} value={courseForm.aciklama} onChange={e => setCourseForm({ ...courseForm, aciklama: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Ekleniyor...' : 'Ders Ekle'}</button>
                <button type="button" onClick={() => setShowCourseModal(false)} className="btn-secondary">İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Öğrenci Rapor Modalı */}
      {reportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-gray-900">📋 {reportModal.ad_soyad} — Detay Raporu</h3>
              <div className="flex gap-2">
                <button onClick={exportExcel} className="btn-secondary text-xs py-1.5">Excel İndir</button>
                <button onClick={() => { setReportModal(null); setSubmissionDetail(null); }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Video */}
              <div>
                <h4 className="font-medium text-gray-800 mb-2">🎬 Proje Videosu</h4>
                {reportModal.Submission?.video_url && getEmbedUrl(reportModal.Submission.video_url) ? (
                  <iframe className="w-full aspect-video rounded-lg border" src={getEmbedUrl(reportModal.Submission.video_url)} allowFullScreen title="Video" />
                ) : (
                  <div className="bg-gray-100 rounded-lg aspect-video flex items-center justify-center text-gray-400 text-sm">
                    Video önizleme yüklenemedi
                  </div>
                )}
                {reportModal.Submission?.video_url && (
                  <a href={reportModal.Submission.video_url} target="_blank" rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
                    🔗 Videoyu yeni sekmede aç
                  </a>
                )}
              </div>

              {/* İstatistikler */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Aldığı Ort.', val: submissionDetail?.istatistikler?.alinanGenelOrtalama },
                    { label: 'Akran Ort.', val: submissionDetail?.istatistikler?.alinanAkranOrtalamasi },
                    { label: 'Hoca Puanı', val: submissionDetail?.istatistikler?.hocaGenelPuani },
                    { label: 'Verdiği Ort.', val: submissionDetail?.istatistikler?.verdigiOrtalama },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-primary-700">{fmtAvg(val)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-gray-700">
                  <strong className="text-amber-700 block mb-1">Proje Açıklaması:</strong>
                  {reportModal.Submission?.proje_aciklamasi || <span className="text-gray-400 italic">Açıklama girilmemiş.</span>}
                </div>
                {!submissionDetail && (
                  <div className="text-xs text-gray-400 text-center py-2">Detaylar yükleniyor...</div>
                )}
              </div>
            </div>

            {/* Kriter Puanlama */}
            <div className="p-5 border-t border-gray-100">
              <h4 className="font-semibold text-gray-900 mb-3">⭐ Kriter Puanları Ver</h4>
              {criteria.length === 0 ? (
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  ⚠️ Bu ders için henüz kriter tanımlanmamış. Sol paneldeki <strong>"Kriter Ekle"</strong> bölümünden kriter ekleyin.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {criteria.map(c => (
                      <div key={c.id} className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <div className="text-sm font-medium text-gray-800 mb-1.5">{c.kriter_adi}</div>
                        <input type="number" min={0} max={c.max_puan}
                          className="input-field text-sm"
                          placeholder={`Maks: ${c.max_puan}`}
                          value={hocaPuanlari[c.id] ?? ''}
                          onChange={e => setHocaPuanlari({ ...hocaPuanlari, [c.id]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  <button onClick={saveHocaPuanlari} className="btn-primary w-full">Puanları Kaydet</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
