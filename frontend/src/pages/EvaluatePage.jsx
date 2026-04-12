import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SmartPlayer from '../components/SmartPlayer';
import { api } from '../services/api';

const EvaluatePage = () => {
  const [submission, setSubmission] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [scores, setScores] = useState({});
  const [watchFinished, setWatchFinished] = useState(true);
  const [hasUploaded, setHasUploaded] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
  const selectedCourse = localStorage.getItem('selectedCourse');
  console.log('Selected Course:', selectedCourse);
  console.log('User:', user);

  // 1. Önce Video Yükleme Durumunu Kontrol Et
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data } = await api.evaluations.checkSubmissionStatus(user.id, selectedCourse);
        setHasUploaded(data.hasUploaded);
        
        // Eğer yüklemişse, değerlendirme verilerini getir
        if (data.hasUploaded) {
          loadInitialData();
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Durum kontrol hatası:", err);
        setLoading(false);
      }
    };

    const loadInitialData = async () => {
      try {
        // A) Video Ata (Rastgele bir video getirir)
        const assignRes = await api.evaluations.assignVideo(user.id, selectedCourse);
        
        if (!assignRes.ok) {
          const errData = assignRes;
          alert(errData.error || 'Puanlanacak video bulunamadı.');
          navigate('/dashboard');
          return;
        }
        setSubmission(assignRes.data);

        // B) Kriterleri Getir
        const criteriaRes = await api.criteria.listByCourse(selectedCourse);
        const criteriaData = criteriaRes.data;
        console.log('Kriterler API yanıtı:', criteriaData);
        if (criteriaRes.ok) {
          setCriteria(criteriaData);
        }
      } catch (err) {
        console.error("Veri yükleme hatası:", err);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [navigate, selectedCourse, user.id]);

  const handleScoreChange = (id, val) => {
    setScores({ ...scores, [id]: val });
  };

  const submitEvaluation = async () => {
    if (Object.keys(scores).length < criteria.length) {
      alert("Lütfen tüm kriterleri puanlayın!");
      return;
    }

    const payload = {
      submissionId: submission.id,
      userId: user.id,
      puanlananOgrenciId: submission.userId || submission.UserId,
      scores: Object.entries(scores).map(([id, val]) => ({
        criterionId: parseInt(id),
        puan: parseInt(val)
      }))
    };

    try {
      const res = await api.grades.create(payload);
      
      if (res.ok) {
        alert("Değerlendirme başarıyla gönderildi! 🌟");
        navigate('/dashboard');
      } else {
        const errData = res;
        alert(errData.error || "Değerlendirme kaydedilemedi.");
      }
    } catch (err) {
      alert("Hata oluştu.");
    }
  };

  // --- RENDER MANTIĞI ---

  if (loading) return <div style={{padding:'50px', textAlign:'center'}}>Veriler yükleniyor...</div>;

  // Video yüklememişse engelleyici uyarı ekranı
  if (hasUploaded === false) {
    return (
      <div style={warningContainerStyle}>
        <div style={warningCardStyle}>
          <h2 style={{color: '#e74c3c'}}>🚫 Erişim Engellendi</h2>
          <p>Başkalarının projelerini puanlayabilmek için önce kendi projenizi sisteme yüklemelisiniz.</p>
          <button onClick={() => navigate('/dashboard')} style={primaryBtnStyle}>
            Hemen Proje Yükle
          </button>
        </div>
      </div>
    );
  }

  if (!submission) return <div style={{padding:'50px', textAlign:'center'}}>Puanlanacak proje bulunamadı.</div>;

  return (
    <div style={{ padding: '30px', maxWidth: '800px', margin: 'auto', fontFamily: 'Segoe UI' }}>
      <button onClick={() => navigate('/dashboard')} style={{marginBottom: '20px', cursor: 'pointer', padding: '8px 15px', borderRadius:'5px', border:'1px solid #ccc'}}>⬅️ Geri Dön</button>
      
      <div style={{backgroundColor: '#fff', padding: '25px', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)'}}>
        <h2 style={{marginTop: 0}}>🎬 Proje Değerlendirme</h2>
        <p style={{color: '#666'}}>Ders: <strong>{selectedCourse?.replace('_', ' ').toUpperCase()}</strong></p>
        
        <SmartPlayer 
          videoUrl={submission.video_url} 
          onWatchComplete={(status) => setWatchFinished(status)} 
        />
        
        <div style={{ marginTop: '30px', padding: '20px', borderTop: '2px solid #eee', opacity: watchFinished ? 1 : 0.5 }}>
          <h3>⭐ Değerlendirme Kriterleri</h3>
          {!watchFinished && <p style={{color: '#e67e22', fontWeight: 'bold'}}>⚠️ Puan verebilmek için videoyu sonuna kadar izlemelisiniz.</p>}
          
          {criteria.map(c => {
            console.log('Kriter render ediliyor:', c);
            return (
            <div key={c.id} style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{fontWeight: '500', flex: 1}}>{c.kriter_adi} <small style={{color: '#888'}}>(Maks: {c.max_puan})</small></label>
              <input 
                type="number" 
                min="0"
                max={c.max_puan}
                disabled={!watchFinished}
                onChange={(e) => handleScoreChange(c.id, e.target.value)}
                style={{width: '80px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd'}}
              />
            </div>
            );
          })}

          <button 
            onClick={submitEvaluation} 
            disabled={!watchFinished}
            style={{ 
              width: '100%', 
              padding: '15px', 
              fontSize: '16px',
              borderRadius: '10px',
              border: 'none',
              cursor: watchFinished ? 'pointer' : 'not-allowed',
              backgroundColor: watchFinished ? '#27ae60' : '#bdc3c7', 
              color: 'white',
              fontWeight: 'bold',
              transition: '0.3s'
            }}
          >
            {watchFinished ? "Değerlendirmeyi Gönder" : "Lütfen Videoyu Bitirin"}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- STİLLER ---
const warningContainerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' };
const warningCardStyle = { backgroundColor: '#fff', padding: '40px', borderRadius: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '450px' };
const primaryBtnStyle = { padding: '12px 25px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '20px' };

export default EvaluatePage;
