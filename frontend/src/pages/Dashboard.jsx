import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const selectedCourse = localStorage.getItem('selectedCourse') || '';
  const [isModalOpen, setModalOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [hasUploaded, setHasUploaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (user.id && selectedCourse) {
      api.evaluations.checkSubmissionStatus(user.id, selectedCourse)
        .then(r => { if (r.ok) setHasUploaded(r.data.hasUploaded); })
        .catch(() => {});
    }
  }, []);

  const handleVideoSubmit = async (e) => {
    e.preventDefault();
    if (!videoUrl.trim()) { alert('Lütfen bir video linki girin!'); return; }
    setSaving(true);
    try {
      const res = await api.submissions.create({ userId: user.id, video_url: videoUrl.trim(), proje_aciklamasi: aciklama, ders_kodu: selectedCourse });
      if (res.ok) {
        setModalOpen(false);
        setVideoUrl('');
        setAciklama('');
        setHasUploaded(true);
        alert('Ödeviniz başarıyla yüklendi! ✅');
      } else {
        alert(res.error || 'Hata oluştu.');
      }
    } catch {
      alert('Sunucuya ulaşılamadı.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary-800 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎓</span>
            <div>
              <div className="font-semibold text-sm">Ödev Portalı</div>
              <div className="text-primary-200 text-xs">{selectedCourse.replace(/_/g, ' ').toUpperCase()}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-primary-200 hidden sm:block">Merhaba, <strong className="text-white">{user.ad_soyad}</strong></span>
            <button onClick={handleLogout} className="text-sm text-primary-200 hover:text-white transition-colors">
              Çıkış
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Merhaba, {user.ad_soyad}! 👋</h1>
          <p className="text-gray-500 mt-1">Ne yapmak istersiniz?</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
          {/* Ödev yükle */}
          <button
            onClick={() => setModalOpen(true)}
            className="card p-6 text-left hover:shadow-md hover:border-primary-300 transition-all group"
          >
            <div className="text-4xl mb-3">📤</div>
            <h3 className="font-semibold text-gray-900 group-hover:text-primary-700">Ödevini Teslim Et</h3>
            <p className="text-sm text-gray-500 mt-1">Proje video linkini ve açıklamanı yükle.</p>
            {hasUploaded && <span className="mt-3 inline-block badge-green">✓ Yüklendi</span>}
          </button>

          {/* Değerlendir */}
          <button
            onClick={() => navigate('/evaluate')}
            className="card p-6 text-left hover:shadow-md hover:border-primary-300 transition-all group"
          >
            <div className="text-4xl mb-3">⭐</div>
            <h3 className="font-semibold text-gray-900 group-hover:text-primary-700">Arkadaşını Değerlendir</h3>
            <p className="text-sm text-gray-500 mt-1">Rastgele bir projeyi izle ve puanla.</p>
          </button>
        </div>
      </main>

      {/* Video yükleme modalı */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">🚀 Proje Videosu Yükle</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleVideoSubmit} className="space-y-4">
              <div>
                <label className="label">YouTube Video Linki *</label>
                <input className="input-field" type="url" placeholder="https://youtu.be/..."
                  value={videoUrl} onChange={e => setVideoUrl(e.target.value)} required />
              </div>
              <div>
                <label className="label">Proje Açıklaması</label>
                <textarea className="input-field" rows={3} placeholder="Projeniz hakkında kısa bilgi..."
                  value={aciklama} onChange={e => setAciklama(e.target.value)} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5">
                  {saving ? 'Yükleniyor...' : 'Ödevi Teslim Et'}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
