import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SmartPlayer from '../components/SmartPlayer';
import { api } from '../services/api';

export default function EvaluatePage() {
  const [submission, setSubmission] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [scores, setScores] = useState({});
  const [watchFinished, setWatchFinished] = useState(false);
  const [hasUploaded, setHasUploaded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const selectedCourse = localStorage.getItem('selectedCourse') || '';

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const checkAndLoad = async () => {
      try {
        const statusRes = await api.evaluations.checkSubmissionStatus(user.id, selectedCourse);
        const uploaded = statusRes.data?.hasUploaded;
        setHasUploaded(uploaded);
        if (!uploaded) { setLoading(false); return; }

        const assignRes = await api.evaluations.assignVideo(user.id, selectedCourse);
        if (!assignRes.ok) {
          alert(assignRes.error || 'Puanlanacak video bulunamadı.');
          navigate('/dashboard');
          return;
        }
        setSubmission(assignRes.data);

        const criteriaRes = await api.criteria.listByCourse(selectedCourse);
        if (criteriaRes.ok) setCriteria(criteriaRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    checkAndLoad();
  }, []);

  const submitEvaluation = async () => {
    if (Object.keys(scores).length < criteria.length) {
      alert('Lütfen tüm kriterleri puanlayın!'); return;
    }
    setSaving(true);
    try {
      const res = await api.grades.create({
        submissionId: submission.id,
        userId: user.id,
        puanlananOgrenciId: submission.userId || submission.UserId,
        scores: Object.entries(scores).map(([id, val]) => ({ criterionId: parseInt(id), puan: parseInt(val) })),
      });
      if (res.ok) {
        alert('Değerlendirme başarıyla gönderildi! 🌟');
        navigate('/dashboard');
      } else {
        alert(res.error || 'Değerlendirme kaydedilemedi.');
      }
    } catch {
      alert('Hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Yükleniyor...</div>
      </div>
    );
  }

  if (hasUploaded === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card p-8 max-w-md text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Erişim Engellendi</h2>
          <p className="text-gray-500 text-sm mb-6">Başkalarını puanlayabilmek için önce kendi projenizi yüklemeniz gerekiyor.</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">Proje Yükle</button>
        </div>
      </div>
    );
  }

  if (!submission) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="card p-8 text-center text-gray-500">Puanlanacak proje bulunamadı.</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="text-primary-200 hover:text-white transition-colors text-sm">
            ← Geri
          </button>
          <div className="font-semibold">Proje Değerlendirme</div>
          <span className="ml-auto text-primary-200 text-sm">{selectedCourse.replace(/_/g, ' ').toUpperCase()}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Video */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">🎬 Proje Videosu</h2>
          <SmartPlayer videoUrl={submission.video_url} onWatchComplete={setWatchFinished} />
          {!watchFinished && (
            <div className="mt-3 flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
              <span>⚠️</span>
              <span>Puan verebilmek için videoyu <strong>%90</strong> izlemeniz gerekiyor.</span>
            </div>
          )}
        </div>

        {/* Kriterler */}
        {criteria.length > 0 && (
          <div className={`card p-5 transition-opacity ${watchFinished ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <h3 className="font-semibold text-gray-900 mb-4">⭐ Değerlendirme Kriterleri</h3>
            <div className="space-y-4">
              {criteria.map(c => (
                <div key={c.id} className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-800">{c.kriter_adi}</div>
                    <div className="text-xs text-gray-400">0 – {c.max_puan} puan</div>
                  </div>
                  <input
                    type="number" min={0} max={c.max_puan}
                    className="input-field w-24 text-center"
                    placeholder={`/ ${c.max_puan}`}
                    disabled={!watchFinished}
                    value={scores[c.id] ?? ''}
                    onChange={e => setScores({ ...scores, [c.id]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={submitEvaluation}
              disabled={!watchFinished || saving}
              className="btn-primary w-full mt-5 py-3 text-base"
            >
              {saving ? 'Gönderiliyor...' : 'Değerlendirmeyi Gönder'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
