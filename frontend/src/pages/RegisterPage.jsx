import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    ogrenci_no: '',
    ad_soyad: '',
    sifre: '',
    secilenDersler: []
  });
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dersler Listesini Fetch Et
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await api.courses.list();
        if (response.ok) {
          setCourses(response.data);
        } else {
          console.error('Dersler yüklenemedi');
          setCourses([]);
        }
      } catch (error) {
        console.error('Dersler çekilirken hata:', error);
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

  // Checkbox Değişim Yönetimi
  const handleCheckboxChange = (dersId) => {
    setFormData(prev => {
      const yeniDersler = prev.secilenDersler.includes(dersId)
        ? prev.secilenDersler.filter(id => id !== dersId)
        : [...prev.secilenDersler, dersId];
      return { ...prev, secilenDersler: yeniDersler };
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (formData.secilenDersler.length === 0) {
      alert("Lütfen en az bir ders seçiniz!");
      return;
    }

    try {
      const response = await api.auth.register(formData);

      if (response.ok) {
        alert("Kayıt başarılı! Giriş yapabilirsiniz.");
        navigate('/login');
      } else {
        // Backend'den gelen "Bu numaraya sahip öğrenci listede yok" uyarısını gösterir
        alert(response.error || "Kayıt sırasında bir hata oluştu.");
      }
    } catch (error) {
      alert("Sunucuya bağlanılamadı.");
    }
  };

  return (
    <div style={containerStyle}>
      <form onSubmit={handleRegister} style={formStyle}>
        <h2>🎓 Öğrenci Kayıt Paneli</h2>
        
        <input 
          type="text" 
          placeholder="Öğrenci Numarası" 
          onChange={(e) => setFormData({...formData, ogrenci_no: e.target.value})}
          style={inputStyle} required 
        />
        
        <input 
          type="text" 
          placeholder="Ad Soyad" 
          onChange={(e) => setFormData({...formData, ad_soyad: e.target.value})}
          style={inputStyle} required 
        />

        <input 
          type="password" 
          placeholder="Şifre Oluştur" 
          onChange={(e) => setFormData({...formData, sifre: e.target.value})}
          style={inputStyle} required 
        />

        <div style={checkboxGroupStyle}>
          <p style={{ fontWeight: 'bold', marginBottom: '10px' }}>Aldığınız Dersleri Seçiniz:</p>
          {loading ? (
            <p style={{ color: '#7f8c8d' }}>Dersler yükleniyor...</p>
          ) : courses.length > 0 ? (
            courses.map(course => (
              <label key={course.ders_kodu} style={checkboxLabelStyle}>
                <input 
                  type="checkbox" 
                  checked={formData.secilenDersler.includes(course.ders_kodu)}
                  onChange={() => handleCheckboxChange(course.ders_kodu)}
                />
                {course.ders_adi}
              </label>
            ))
          ) : (
            <p style={{ color: '#e74c3c' }}>Kayıtlı ders bulunamadı.</p>
          )}
        </div>

        <button type="submit" style={btnStyle}>Kayıt Ol</button>
        <p onClick={() => navigate('/login')} style={{ cursor: 'pointer', color: '#3498db', marginTop: '15px' }}>
          Zaten hesabın var mı? Giriş yap.
        </p>
      </form>
    </div>
  );
};

// --- STİLLER ---
const containerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f0f2f5' };
const formStyle = { backgroundColor: '#fff', padding: '40px', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '350px', textAlign: 'center' };
const inputStyle = { width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' };
const checkboxGroupStyle = { textAlign: 'left', marginBottom: '20px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '8px' };
const checkboxLabelStyle = { display: 'block', marginBottom: '8px', cursor: 'pointer' };
const btnStyle = { width: '100%', padding: '12px', backgroundColor: '#2ecc71', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' };

export default RegisterPage;

