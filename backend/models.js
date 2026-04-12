const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');

// 1. KULLANICI
const User = sequelize.define('User', {
  ogrenci_no: { type: DataTypes.STRING, unique: true, allowNull: false },
  ad_soyad: { type: DataTypes.STRING, allowNull: false },
  sifre: { type: DataTypes.STRING, allowNull: false },
  rol: { type: DataTypes.ENUM('ogrenci', 'hoca'), defaultValue: 'ogrenci' },
  is_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
  authorized_course: { type: DataTypes.STRING, allowNull: true }
});

// 1.5. DERSLER - DİNAMİK DERS YÖNETİMİ
const Course = sequelize.define('Course', {
  ders_kodu: { type: DataTypes.STRING, unique: true, allowNull: false }, // internet_programlama, yapay_zeka vb
  ders_adi: { type: DataTypes.STRING, allowNull: false }, // İnternet Programcılığı, Yapay Zeka vb
  aciklama: { type: DataTypes.TEXT }
});

// 2. ÖDEV / VİDEO
const Submission = sequelize.define('Submission', {
  ders_kodu: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  video_url: { 
    type: DataTypes.STRING, 
    allowNull: false,
    validate: {
      isUrl: true // URL formatında mı?
    }
  },
  proje_aciklamasi: { type: DataTypes.TEXT },

  hoca_puani: { // Hocanın verdiği puan
    type: DataTypes.INTEGER,
    validate: {
      min: 0,
      max: 100
    }
  }
});


// 3. KRİTER
const Criterion = sequelize.define('Criterion', {
  kriter_adi: { type: DataTypes.STRING, allowNull: false },
  min_puan: { type: DataTypes.INTEGER, defaultValue: 0 },
  max_puan: { type: DataTypes.INTEGER, defaultValue: 100 },
  ders_kodu: { type: DataTypes.STRING, allowNull: false }
});

//4. PUAN
const Grade = sequelize.define('Grade', {
  puan: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  puan_veren_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  puanlanan_ogrenci_id: { // Yeni sütun
    type: DataTypes.INTEGER,
    allowNull: false
  }
  
});
// 5. İZİN VERİLEN ÖĞRENCİLER 
const AllowedStudent = sequelize.define('AllowedStudent', {
  ogrenci_no: { type: DataTypes.STRING, unique: true, allowNull: false },
  ad_soyad: { type: DataTypes.STRING },
  // Dersleri virgülle ayrılmış string olarak tutacağız (Örn: "internet_programlama,yapay_zeka")
  dersler: { type: DataTypes.TEXT, defaultValue: '' } 
});
// 6. GENEL AYARLAR 
const Settings = sequelize.define('Settings', {
  key: { type: DataTypes.STRING, unique: true },
  value: { type: DataTypes.STRING }
});

// --- İLİŞKİLER (Associations) ---

// Öğrenci -> Video ilişkisi
User.hasMany(Submission); 
Submission.belongsTo(User);

// AllowedStudent ile User ilişkisi (Admin paneli tüm öğrenciler için)
AllowedStudent.belongsTo(User, { as: 'RegisteredUser', foreignKey: 'ogrenci_no', targetKey: 'ogrenci_no', constraints: false });
User.hasMany(AllowedStudent, { foreignKey: 'ogrenci_no', sourceKey: 'ogrenci_no', constraints: false });

// Video -> Puan ilişkisi
Submission.hasMany(Grade); 
Grade.belongsTo(Submission);

// Puanlayan Öğrenci -> Puan ilişkisi
User.hasMany(Grade, { as: 'VerilenPuanlar', foreignKey: 'puan_veren_id' });
Grade.belongsTo(User, { as: 'PuanVeren', foreignKey: 'puan_veren_id' });

// KRİTİK EKSİK: Kriter -> Puan ilişkisi
// Her puanın hangi kritere (sunum, içerik vb.) ait olduğunu bilmemiz gerekir.
Criterion.hasMany(Grade);
Grade.belongsTo(Criterion);

module.exports = { User, Submission, Criterion, Grade, AllowedStudent, Settings, Course };
