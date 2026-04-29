import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';

export default function LoginPage() {
  const [ogrenci_no, setOgrenciNo] = useState('');
  const [sifre, setSifre] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.auth.login({ ogrenci_no: ogrenci_no.trim(), sifre });
      if (res.ok) {
        localStorage.setItem('user', JSON.stringify(res.data.user));
        if (res.data.user.rol === 'hoca') {
          navigate('/admin');
        } else {
          const dersler = res.data.user.dersler || [];
          if (dersler.length === 1) {
            localStorage.setItem('selectedCourse', dersler[0]);
            navigate('/dashboard');
          } else if (dersler.length > 1) {
            navigate('/course-selection');
          } else {
            alert('Üzerinize tanımlı ders bulunamadı!');
          }
        }
      } else {
        alert(res.error || 'Giriş başarısız.');
      }
    } catch {
      alert('Sunucuya bağlanılamadı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <span className="text-3xl">🎓</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Ödev Portalı</h1>
          <p className="text-primary-200 text-sm mt-1">Sisteme giriş yapın</p>
        </div>

        {/* Form */}
        <div className="card p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="label">Öğrenci / Kullanıcı No</label>
              <input
                className="input-field"
                type="text"
                placeholder="Kullanıcı adınızı girin"
                value={ogrenci_no}
                onChange={e => setOgrenciNo(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Şifre</label>
              <input
                className="input-field"
                type="password"
                placeholder="Şifrenizi girin"
                value={sifre}
                onChange={e => setSifre(e.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-base">
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            Hesabınız yok mu?{' '}
            <Link to="/register" className="text-primary-600 font-medium hover:underline">
              Kayıt Ol
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
