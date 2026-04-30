const { DataTypes } = require('sequelize');
const crypto = require('crypto');
const { promisify } = require('util');
const { sequelize } = require('./db');

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_PREFIX = 'scrypt';
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

const hashPassword = async (plainPassword) => {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const derivedKey = await scryptAsync(plainPassword, salt, KEY_LENGTH);
  return `${PASSWORD_PREFIX}$${salt}$${derivedKey.toString('hex')}`;
};

const verifyPassword = async (plainPassword, storedPassword) => {
  if (!storedPassword || typeof storedPassword !== 'string') {
    return false;
  }

  const [prefix, salt, storedKey] = storedPassword.split('$');
  if (prefix !== PASSWORD_PREFIX || !salt || !storedKey) {
    return plainPassword === storedPassword;
  }

  const derivedKey = await scryptAsync(plainPassword, salt, KEY_LENGTH);
  const storedKeyBuffer = Buffer.from(storedKey, 'hex');

  if (storedKeyBuffer.length !== derivedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedKeyBuffer, derivedKey);
};

const needsPasswordRehash = (storedPassword) => {
  return typeof storedPassword === 'string' && !storedPassword.startsWith(`${PASSWORD_PREFIX}$`);
};

// 1. KULLANICI
const User = sequelize.define('User', {
  ogrenci_no: { type: DataTypes.STRING, unique: true, allowNull: false },
  ad_soyad: { type: DataTypes.STRING, allowNull: false },
  sifre: { type: DataTypes.STRING, allowNull: false },
  rol: { type: DataTypes.ENUM('ogrenci', 'hoca'), defaultValue: 'ogrenci' },
  is_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
  authorized_course: { type: DataTypes.STRING, allowNull: true }
}, {
  tableName: 'users',
  freezeTableName: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.sifre && needsPasswordRehash(user.sifre)) {
        user.sifre = await hashPassword(user.sifre);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('sifre') && user.sifre && needsPasswordRehash(user.sifre)) {
        user.sifre = await hashPassword(user.sifre);
      }
    }
  }
});

// 2. DERSLER - DİNAMİK DERS YÖNETİMİ
const Course = sequelize.define('Course', {
  ders_kodu: { type: DataTypes.STRING, unique: true, allowNull: false },
  ders_adi: { type: DataTypes.STRING, allowNull: false },
  aciklama: { type: DataTypes.TEXT }
}, {
  tableName: 'courses',
  freezeTableName: true
});

// 3. ÖDEV / VİDEO
const Submission = sequelize.define('Submission', {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  ders_kodu: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  video_url: { 
    type: DataTypes.STRING, 
    allowNull: false,
    validate: {
      isUrl: true
    }
  },
  proje_aciklamasi: { type: DataTypes.TEXT },

  hoca_puani: {
    type: DataTypes.INTEGER,
    validate: {
      min: 0,
      max: 100
    }
  }
}, {
  tableName: 'submissions',
  freezeTableName: true
});


// 4. KRİTER
const Criterion = sequelize.define('Criterion', {
  kriter_adi: { type: DataTypes.STRING, allowNull: false },
  min_puan: { type: DataTypes.INTEGER, defaultValue: 0 },
  max_puan: { type: DataTypes.INTEGER, defaultValue: 100 },
  ders_kodu: { type: DataTypes.STRING, allowNull: false }
}, {
  tableName: 'criteria',
  freezeTableName: true
});

// 5. PUAN
const Grade = sequelize.define('Grade', {
  puan: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  puan_veren_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  submissionId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  criterionId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  puanlanan_ogrenci_id: { 
    type: DataTypes.INTEGER,
    allowNull: false
  }
  
}, {
  tableName: 'grades',
  freezeTableName: true,
  indexes: [
    {
      unique: true,
      fields: ['submissionId', 'puan_veren_id', 'criterionId']
    }
  ]
});
// 6. İZİN VERİLEN ÖĞRENCİLER 
const AllowedStudent = sequelize.define('AllowedStudent', {
  ogrenci_no: { type: DataTypes.STRING, unique: true, allowNull: false },
  ad_soyad: { type: DataTypes.STRING },
  dersler: { type: DataTypes.TEXT, defaultValue: '' } 
}, {
  tableName: 'allowed_students',
  freezeTableName: true
});
// 7. GENEL AYARLAR 
const Settings = sequelize.define('Settings', {
  key: { type: DataTypes.STRING, unique: true },
  value: { type: DataTypes.STRING }
}, {
  tableName: 'settings',
  freezeTableName: true
});

// --- İLİŞKİLER ---
User.hasMany(Submission, { foreignKey: 'userId', as: 'submissions' });
Submission.belongsTo(User, { foreignKey: 'userId', as: 'user' });

AllowedStudent.belongsTo(User, { as: 'RegisteredUser', foreignKey: 'ogrenci_no', targetKey: 'ogrenci_no', constraints: false });
User.hasMany(AllowedStudent, { foreignKey: 'ogrenci_no', sourceKey: 'ogrenci_no', constraints: false });

Submission.hasMany(Grade, { foreignKey: 'submissionId', as: 'grades' });
Grade.belongsTo(Submission, { foreignKey: 'submissionId', as: 'submission' });

User.hasMany(Grade, { as: 'givenGrades', foreignKey: 'puan_veren_id' });
Grade.belongsTo(User, { as: 'puanVeren', foreignKey: 'puan_veren_id' });

Criterion.hasMany(Grade, { foreignKey: 'criterionId', as: 'grades' });
Grade.belongsTo(Criterion, { foreignKey: 'criterionId', as: 'criterion' });

module.exports = {
  User,
  Submission,
  Criterion,
  Grade,
  AllowedStudent,
  Settings,
  Course,
  hashPassword,
  verifyPassword,
  needsPasswordRehash
};
