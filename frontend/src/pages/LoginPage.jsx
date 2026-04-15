import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';


const LoginPage = () => {
  const [ogrenci_no, setogrenci_no] = useState('');
  const [sifre, setSifre] = useState('');
  const [error,setError] = useState('');
  
  const navigate = useNavigate();

const handleLogin = async (e) => {
  e.preventDefault();
  const response = await api.auth.login({ ogrenci_no: ogrenci_no.trim(), sifre });
  const data = response.data;

  if (response.ok) {
    localStorage.setItem('user', JSON.stringify(data.user));

    if (data.user.rol === 'hoca') {
  
      navigate('/admin');
    } else {
   
      const dersSayisi = data.user.dersler.length;

      if (dersSayisi === 1) {
       
        localStorage.setItem('selectedCourse', data.user.dersler[0]);
        navigate('/dashboard');
      } else if (dersSayisi > 1) {
       
        navigate('/course-selection');
      } else {
        alert("Üzerinize tanımlı ders bulunamadı!");
      }
    }
  } else {
    alert(response.error);
  }
};

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>
      <div style={{ padding: '30px', border: '1px solid #ccc', borderRadius: '8px', width: '350px' }}>
        <h2 style={{ textAlign: 'center' }}>Ödev Portalı</h2>
        <form onSubmit={handleLogin}>
          <input 
            type="text" 
            placeholder="Öğrenci Numarası" 
            value={ogrenci_no} 
            onChange={(e) => setogrenci_no(e.target.value)} 
            style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
          />
          <input 
            type="password" 
            placeholder="Şifre" 
            value={sifre} 
            onChange={(e) => setSifre(e.target.value)} 
            style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
          />
          {error && <p style={{ color: 'red', fontSize: '14px' }}>{error}</p>}
          <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>
            Giriş Yap
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
