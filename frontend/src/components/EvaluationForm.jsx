import React, { useState } from 'react';

const EvaluationForm = ({ criteria, submissionId }) => {
  const [scores, setScores] = useState({}); // { kriterId: puan }

  const handleScoreChange = (criterionId, value) => {
    setScores({ ...scores, [criterionId]: value });
  };

  const handleSubmit = async () => {
    // Burada backend'deki /api/grades endpoint'ine istek atacağız
    console.log("Gönderilen Puanlar:", { submissionId, scores });
    // Örnek: scores objesini mapleyip her biri için bir Grade kaydı oluşturulacak
  };

  return (
    <div className="p-4 border rounded">
      <h3 className="text-xl font-bold mb-4">Projeyi Değerlendir</h3>
      {criteria.map((c) => (
        <div key={c.id} className="mb-4">
          <label className="block font-medium">{c.kriter_adi} ({c.max_puan} Puan)</label>
          <input
            type="number"
            max={c.max_puan}
            min={c.min_puan}
            className="w-full p-2 border rounded"
            onChange={(e) => handleScoreChange(c.id, e.target.value)}
          />
        </div>
      ))}
      <button 
        onClick={handleSubmit}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Değerlendirmeyi Kaydet
      </button>
    </div>
  );
}; 
export default EvaluationForm;
