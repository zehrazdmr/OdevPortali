const { Sequelize } = require('sequelize');

// 'veritabani_adi', 'kullanici_adi', 'sifre'
const sequelize = new Sequelize('odev_portali', 'postgres', '300518', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false, 
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL Bağlantısı Başarılı!');
  } catch (error) {
    console.error('❌ Bağlantı Hatası:', error);
  }
};
module.exports = { sequelize, connectDB };
