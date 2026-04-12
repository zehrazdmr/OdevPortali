import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard'; 
import EvaluatePage from './pages/EvaluatePage';
import AdminPanel from './pages/AdminPanel';
import RegisterPage from './pages/RegisterPage';
import CourseSelection from './pages/CourseSelection';



function App() {
  return (
    <Router>
      <Routes>
        {/* Giriş Sayfası */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Ana Sayfa (Dashboard) */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Başlangıçta direkt login'e yönlendir */}
        <Route path="/" element={<Navigate to="/register" />} />
        
        {/*Değerlendirme Sayfası */}
        <Route path="/evaluate" element={<EvaluatePage />} />
        {/*Admin Sayfası */}
        <Route path="/admin" element={<AdminPanel />} />
        {/*Kayıt Sayfası */}
        <Route path="/register" element={<RegisterPage />} />
        {/* Ders Seçim Sayfası */}
        <Route path="/course-selection" element={<CourseSelection />} />
      </Routes>
    </Router>
  );
}

export default App;