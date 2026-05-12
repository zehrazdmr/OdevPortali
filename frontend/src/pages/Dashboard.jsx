import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const fmtCount = (value) => (value != null ? String(Number(value)) : '—');
const fmtScore = (value) => {
  if (value == null || value === '') return '—';
  if (value && typeof value === 'object' && typeof value.display === 'string' && value.display.trim()) {
    return value.display;
  }
  if (typeof value === 'string' && value.trim()) return value;
  return '—';
};

export default function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const userId = user?.id;
  const selectedCourse = localStorage.getItem('selectedCourse') || '';
  const [isModalOpen, setModalOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [hasUploaded, setHasUploaded] = useState(false);
  const [submissionSummary, setSubmissionSummary] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const loadStatus = async () => {
      if (!userId || !selectedCourse) return;
      try {
        const r = await api.evaluations.checkSubmissionStatus(userId, selectedCourse);
        if (r.ok) {
          setHasUploaded(!!r.data?.hasUploaded);
          setSubmissionSummary(r.data?.hasUploaded ? r.data : null);
        }
      } catch {
        setHasUploaded(false);
        setSubmissionSummary(null);
      }
    };

    loadStatus();
  }, [navigate, selectedCourse, userId]);

  const openVideoModal = () => {
    setVideoUrl(submissionSummary?.submission?.video_url || '');
    setAciklama(submissionSummary?.submission?.proje_aciklamasi || '');
    setModalOpen(true);
  };

  const refreshStatus = async () => {
    try {
      const r = await api.evaluations.checkSubmissionStatus(userId, selectedCourse);
      if (r.ok) {
        setHasUploaded(!!r.data?.hasUploaded);
        setSubmissionSummary(r.data?.hasUploaded ? r.data : null);
      }
    } catch {
      // Teslim başarılı olsa bile özet isteği başarısız olabilir; akışı bozmayalım.
    }
  };

  const handleVideoSubmit = async (e) => {
    e.preventDefault();
    if (!videoUrl.trim()) {
      alert('Lütfen bir video linki girin!');
      return;
    }

    setSaving(true);
    try {
      const res = await api.submissions.create({
        userId: user.id,
        video_url: videoUrl.trim(),
        proje_aciklamasi: aciklama,
        ders_kodu: selectedCourse,
      });
      if (res.ok) {
        setModalOpen(false);
        setVideoUrl('');
        setAciklama('');
        await refreshStatus();
        alert(res.data?.message || 'Ödeviniz başarıyla kaydedildi! ✅');
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

  const summary = submissionSummary?.istatistikler || {};

  return (
    <div className="min-h-screen bg-gray-50">
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
            <span className="text-sm text-primary-200 hidden sm:block">
              Merhaba, <strong className="text-white">{user.ad_soyad}</strong>
            </span>
            <button onClick={handleLogout} className="text-sm text-primary-200 hover:text-white transition-colors">
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Merhaba, {user.ad_soyad}! 👋</h1>
          <p className="text-gray-500 mt-1">Ne yapmak istersiniz?</p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Puan Özeti</h2>
            {hasUploaded ? (
              <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
                Teslim edildi
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                Henüz teslim yok
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Aldığın Puan', value: summary.alinanGenelOrtalama, kind: 'score' },
              { label: 'Akran Puanı', value: summary.alinanAkranOrtalamasi, kind: 'score' },
              { label: 'Hoca Puanı', value: summary.hocaGenelPuani, kind: 'score' },
              { label: 'Seni Değerlendiren', value: summary.alinanDegerlendirmeSayisi, kind: 'count' },
            ].map(card => (
              <div key={card.label} className="card p-4">
                <div className="text-xs uppercase tracking-wide text-gray-500">{card.label}</div>
                <div className="mt-2 text-3xl font-bold text-primary-700">
                  {card.kind === 'count' ? fmtCount(card.value) : fmtScore(card.value)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
          <button
            onClick={openVideoModal}
            className="card p-6 text-left hover:shadow-md hover:border-primary-300 transition-all group"
          >
            <div className="text-4xl mb-3">📤</div>
            <h3 className="font-semibold text-gray-900 group-hover:text-primary-700">
              {hasUploaded ? 'Videonu Güncelle' : 'Ödevini Teslim Et'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {hasUploaded
                ? 'Mevcut proje videonu yeni bir link ile değiştirebilirsin.'
                : 'Proje video linkini ve açıklamanı yükle.'}
            </p>
            {hasUploaded && <span className="mt-3 inline-block badge-green">✓ Yüklendi</span>}
          </button>

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

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {hasUploaded ? 'Proje Videosunu Güncelle' : 'Proje Videosu Yükle'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">
                ✕
              </button>
            </div>
            {hasUploaded && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Yeni video linki girersen mevcut teslimin güncellenecek.
              </div>
            )}
            <form onSubmit={handleVideoSubmit} className="space-y-4">
              <div>
                <label className="label">YouTube Video Linki *</label>
                <input
                  className="input-field"
                  type="url"
                  placeholder="https://youtu.be/..."
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Proje Açıklaması</label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder="Projeniz hakkında kısa bilgi..."
                  value={aciklama}
                  onChange={e => setAciklama(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5">
                  {saving ? 'Yükleniyor...' : (hasUploaded ? 'Videoyu Güncelle' : 'Ödevi Teslim Et')}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
                  İptal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
