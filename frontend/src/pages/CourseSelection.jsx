import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function CourseSelection() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const aldigiDersler = user?.dersler || [];
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    api.courses.list()
      .then(r => setCourses(r.ok ? r.data : []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (kod) => {
    localStorage.setItem('selectedCourse', kod);
    navigate('/dashboard');
  };

  const handleLogout = () => { localStorage.clear(); navigate('/login'); };

  if (!aldigiDersler.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ders Bulunamadı</h2>
          <p className="text-gray-500 text-sm mb-6">Üzerinize tanımlı ders bulunmamaktadır. Hoca Paneli'nden öğrenci listesi yüklenmesi gerekmektedir.</p>
          <button onClick={handleLogout} className="btn-secondary">Ana Sayfaya Dön</button>
        </div>
      </div>
    );
  }

  const myCourses = courses.filter(c => aldigiDersler.includes(c.ders_kodu));

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 to-primary-700 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">📚 Ders Seçin</h1>
          <p className="text-primary-200 mt-1 text-sm">Devam etmek istediğiniz dersi seçin</p>
        </div>
        {loading ? (
          <div className="text-center text-primary-200">Yükleniyor...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {myCourses.map((course, i) => {
              const colors = ['from-blue-500 to-blue-600', 'from-purple-500 to-purple-600', 'from-emerald-500 to-emerald-600', 'from-rose-500 to-rose-600', 'from-amber-500 to-amber-600'];
              return (
                <button key={course.ders_kodu} onClick={() => handleSelect(course.ders_kodu)}
                  className={`bg-gradient-to-br ${colors[i % colors.length]} text-white p-6 rounded-2xl shadow-lg hover:scale-105 transition-transform text-left`}>
                  <div className="font-bold text-lg">{course.ders_adi}</div>
                  <div className="text-white/70 text-sm mt-1">{course.ders_kodu}</div>
                </button>
              );
            })}
          </div>
        )}
        <div className="text-center mt-8">
          <button onClick={handleLogout} className="text-primary-200 hover:text-white text-sm transition-colors">Çıkış Yap</button>
        </div>
      </div>
    </div>
  );
}
