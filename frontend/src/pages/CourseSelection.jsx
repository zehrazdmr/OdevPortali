import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const CourseSelection = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
  const aldigiDersler = user?.dersler || [];
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Tüm Dersler Listesi Fetch Et
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

  useEffect(() => {
    console.log('📚 CourseSelection - User:', user);
    console.log('📚 CourseSelection - Dersler:', aldigiDersler);
    console.log('📚 CourseSelection - Dersler Sayısı:', aldigiDersler.length);
  }, []);

  const handleSelect = (dersId) => {
    localStorage.setItem('selectedCourse', dersId);
    navigate('/dashboard');
  };

  // Eğer hiç ders yoksa hata ekranı göster
  if (!aldigiDersler || aldigiDersler.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={{...cardStyle, backgroundColor: '#fff3cd', borderLeft: '5px solid #ff9800'}}>
          <h2 style={{color: '#e65100'}}>⚠️ Ders Bulunamadı</h2>
          <p style={{color: '#555'}}>Üzerinize tanımlı ders bulunmamaktadır.</p>
          <p style={{color: '#888', fontSize: '14px'}}>Lütfen sisteme başarıyla kayıt olmuş olduğunuzdan emin olun. Hoca Paneli'nde Excel listesi üzerinden öğrenci eklemesi yapılmış olmalıdır.</p>
          <button onClick={() => { localStorage.clear(); navigate('/login'); }} style={{...primaryBtn, marginTop: '15px'}}>
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h2>📚 Devam Etmek İstediğiniz Dersi Seçin</h2>
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {loading ? (
          <p style={{ color: '#7f8c8d', marginTop: '30px' }}>Dersler yükleniyor...</p>
        ) : courses.length > 0 ? (
          courses.map((course, index) => {
            const colors = ['#007bff', '#9c27b0', '#27ae60', '#e74c3c', '#f39c12', '#16a085'];
            const color = colors[index % colors.length];
            
            // Kullanıcı bu dersi aldı mı?
            if (aldigiDersler.includes(course.ders_kodu)) {
              return (
                <button 
                  key={course.ders_kodu} 
                  onClick={() => handleSelect(course.ders_kodu)} 
                  style={courseBtnStyle(color)}
                >
                  {course.ders_adi}
                </button>
              );
            }
            return null;
          })
        ) : (
          <p style={{ color: '#e74c3c', marginTop: '30px' }}>Ders Seçilmedi</p>
        )}
      </div>
    </div>
  );
};


const courseBtnStyle = (color) => ({
  width: '200px',
  padding: '30px',
  backgroundColor: color,
  color: 'white',
  borderRadius: '15px',
  cursor: 'pointer',
  transition: '0.3s',
  boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
  border: 'none',
  fontSize: '16px',
  fontWeight: 'bold'
});

const containerStyle = {
  display: 'flex',
  flexDirection: 'column',  
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  backgroundColor: '#f0f2f5',
  textAlign: 'center',
  padding: '20px'
};

const cardStyle = {
  padding: '30px',
  borderRadius: '10px',
  maxWidth: '500px'
};

const primaryBtn = {
  padding: '10px 20px',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 'bold'
};

export default CourseSelection;
