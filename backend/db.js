require('dotenv').config(); 

const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql'
  }
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅MySQL Bağlantısı Başarılı!');
  } catch (error) {
    console.error('❌ Bağlantı Hatası:', error);
    throw error;
  }
};
module.exports = { sequelize, connectDB };
