import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ ogrenci_no: '', ad_soyad: '', sifre: '', secilenDersler: [] });
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.courses.list()
      .then(r => setCourses(r.ok ? r.data : []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  const toggleDers = (kod) => {
    setForm(p => ({
      ...p,
      secilenDersler: p.secilenDersler.includes(kod)
        ? p.secilenDersler.filter(d => d !== kod)
        : [...p.secilenDersler, kod],
    }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.secilenDersler.length) { alert('Lütfen en az bir ders seçin!'); return; }
    setSaving(true);
    try {
      const res = await api.auth.register({
        ...form,
        ogrenci_no: form.ogrenci_no.trim(),
        ad_soyad: form.ad_soyad.replace(/\s+/g, ' ').trim(),
      });
      if (res.ok) {
        alert('Kayıt başarılı! Giriş yapabilirsiniz.');
        navigate('/login');
      } else {
        alert(res.error || 'Kayıt sırasında bir hata oluştu.');
      }
    } catch {
      alert('Sunucuya bağlanılamadı.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <span className="text-3xl">📝</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Kayıt Ol</h1>
          <p className="text-primary-200 text-sm mt-1">Yeni öğrenci hesabı oluşturun</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="label">Öğrenci Numarası</label>
              <input className="input-field" type="text" placeholder="Öğrenci numaranız"
                value={form.ogrenci_no} onChange={e => setForm({ ...form, ogrenci_no: e.target.value })} required />
            </div>
            <div>
              <label className="label">Ad Soyad</label>
              <input className="input-field" type="text" placeholder="Adınız ve soyadınız"
                value={form.ad_soyad} onChange={e => setForm({ ...form, ad_soyad: e.target.value })} required />
            </div>
            <div>
              <label className="label">Şifre</label>
              <input className="input-field" type="password" placeholder="Şifre belirleyin"
                value={form.sifre} onChange={e => setForm({ ...form, sifre: e.target.value })} required />
            </div>

            <div>
              <label className="label">Aldığınız Dersler</label>
              {loading ? (
                <div className="text-sm text-gray-400 py-2">Dersler yükleniyor...</div>
              ) : courses.length === 0 ? (
                <div className="text-sm text-red-500 py-2">Kayıtlı ders bulunamadı.</div>
              ) : (
                <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {courses.map(c => (
                    <label key={c.ders_kodu} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-primary-600 rounded"
                        checked={form.secilenDersler.includes(c.ders_kodu)}
                        onChange={() => toggleDers(c.ders_kodu)}
                      />
                      <span className="text-sm text-gray-700">{c.ders_adi}</span>
                      <span className="text-xs text-gray-400 ml-auto">{c.ders_kodu}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={saving} className="btn-primary w-full py-2.5 text-base">
              {saving ? 'Kaydediliyor...' : 'Kayıt Ol'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            Zaten hesabınız var mı?{' '}
            <Link to="/login" className="text-primary-600 font-medium hover:underline">Giriş Yap</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
