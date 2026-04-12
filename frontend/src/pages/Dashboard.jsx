import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // useNavigate eklendi
import { api } from '../services/api';



const Dashboard = () => {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
  const [videoUrl, setVideoUrl] = useState('');
  const [aciklama, setAciklama] = useState('');
  const navigate = useNavigate(); // Navigate hatasını çözer
  const [isModalOpen, setModalOpen] = useState(false); // setModalOpen hatasını çözer


  useEffect(() => {
    // Giriş yapan kullanıcıyı hafızadan çek
    const savedUser = JSON.parse(localStorage.getItem('user'));
    setUser(savedUser);
  }, []);

const handleVideoSubmit = async (e) => {
  e.preventDefault();

  const storedUser = JSON.parse(localStorage.getItem('user'));
  const selectedCourse = localStorage.getItem('selectedCourse');
  
  // Güvenlik Kontrolü
  if (!storedUser || !storedUser.id) {
    alert("Oturum bilgisi bulunamadı, lütfen tekrar giriş yapın.");
    return;
  }

  if (!videoUrl) {
    alert("Lütfen bir video linki giriniz!");
    return;
  }

  // BACKEND İLE TAM UYUMLU PAYLOAD
  const payload = {
    userId: storedUser.id, // Backend index.js'de 'userId' (küçük u) olarak bekliyoruz
    video_url: videoUrl,
    proje_aciklamasi: aciklama,
    ders_kodu: selectedCourse
  };

  try {
    const response = await api.submissions.create(payload);

    if (response.ok) {
      alert("Ödeviniz başarıyla yüklendi! ✅");
      setModalOpen(false);
      setVideoUrl('');
      setAciklama('');
      window.location.reload(); 
    } else {
      alert("Hata: " + response.error);
    }
  } catch (error) {
    console.error("Yükleme hatası:", error);
    alert("Sunucuya ulaşılamadı.");
  }
};

  if (!user) return <p>Yükleniyor...</p>;

  return (
  <div style={{ padding: '30px', fontFamily: 'Segoe UI, sans-serif', textAlign: 'center' }}>
    <div style={{ padding: '30px', fontFamily: 'Segoe UI, sans-serif', position: 'relative' }}></div>
    {/* ÜST BAR: Kullanıcı Bilgisi ve Çıkış */}
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      marginBottom: '30px',
      borderBottom: '1px solid #eee',
      paddingBottom: '10px' 
    }}>
      <div style={{ fontWeight: 'bold', color: '#333' }}>
        🎓 Öğrenci Paneli | {user?.ad_soyad}
      </div>
      
      <button 
        onClick={() => {
          localStorage.clear(); // Tüm oturum verilerini sil
          window.location.href = '/login'; // Giriş sayfasına postala
        }}
        style={logoutButtonStyle}
      >
        🚪 Güvenli Çıkış
      </button>
    </div>
    <header style={{ marginBottom: '40px' }}>
      <h1>Merhaba, {user?.ad_soyad}! 👋</h1>
      <p style={{ color: '#666' }}>Bugün ne yapmak istersin?</p>
    </header>

    <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
      
      {/* KART 1: ÖDEV YÜKLE */}
      <div 
        onClick={() => setModalOpen(true)}
        style={cardStyle('#007bff')}
      >
        <div style={{ fontSize: '40px' }}>📤</div>
        <h3>Ödevini Teslim Et</h3>
        <p>Proje videonu ve açıklamanı buradan yükleyebilirsin.</p>
      </div>

      {/* KART 2: PUANLAMA YAP */}
      <div 
        onClick={() => navigate('/evaluate')}
        style={cardStyle('#ffc107', 'black')}
      >
        <div style={{ fontSize: '40px' }}>⭐</div>
        <h3>Arkadaşlarını Puanla</h3>
        <p>Rastgele bir arkadaşının projesini izle ve değerlendir.</p>
      </div>

    </div>

    {/* MODAL (Video Yükleme Formu - Sadece Butona Basınca Açılsın) */}
    {isModalOpen && (
  <div style={modalOverlayStyle}>
    <div style={modalContentStyle}>
      <h2 style={{ marginBottom: '20px' }}>🚀 Proje Videosu Yükle</h2>
      
      {/* 1. YOUTUBE URL INPUT */}
      <input 
        type="text" 
        placeholder="YouTube Video Linki (örn: https://youtu.be/...)" 
        value={videoUrl}
        onChange={(e) => setVideoUrl(e.target.value)}
        style={inputStyle}
      />

      {/* 2. PROJE AÇIKLAMASI */}
      <textarea 
        placeholder="Projeniz hakkında kısa bir bilgi verin..." 
        value={aciklama}
        onChange={(e) => setAciklama(e.target.value)}
        style={{ ...inputStyle, height: '100px', resize: 'none' }}
      />

      {/* 3. GÖNDER BUTONU */}
      <button 
        onClick={handleVideoSubmit} 
        style={submitButtonStyle}
      >
        Ödevi Teslim Et
      </button>

      {/* 4. KAPAT BUTONU */}
      <button 
        onClick={() => setModalOpen(false)} 
        style={closeButtonStyle}
      >
        Vazgeç
      </button>
    </div>
  </div>
)}
  </div>
);

};
// --- STİL TANIMLAMALARI ---
const inputStyle = {
  width: '100%',
  padding: '12px',
  marginBottom: '15px',
  borderRadius: '8px',
  border: '1px solid #ddd',
  boxSizing: 'border-box' // Taşıp kutuyu bozmaması için
};

const submitButtonStyle = {
  width: '100%',
  padding: '12px',
  backgroundColor: '#28a745',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
  marginBottom: '10px'
};

const closeButtonStyle = {
  backgroundColor: 'transparent',
  color: '#666',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'underline',
  fontSize: '14px'
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0, 0, 0, 0.7)', // Arka planı karartır
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000
};

const modalContentStyle = {
  backgroundColor: 'white',
  padding: '30px',
  borderRadius: '15px',
  width: '400px',
  textAlign: 'center',
  boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
  position: 'relative'
};

const cardStyle = (bgColor, textColor = 'white') => ({
  width: '280px',
  padding: '25px',
  backgroundColor: bgColor,
  color: textColor,
  borderRadius: '15px',
  cursor: 'pointer',
  transition: 'transform 0.2s',
  boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
  border: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center'
});
const logoutButtonStyle = {
  backgroundColor: '#f8d7da',
  color: '#721c24',
  border: '1px solid #f5c6cb',
  padding: '8px 15px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '600',
  transition: '0.3s'
};

export default Dashboard;
