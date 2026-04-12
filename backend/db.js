require('dotenv').config(); 

const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME, 
  process.env.DB_USER, 
  process.env.DB_PASSWORD,  
  {
    host: process.env.DB_HOST,
    dialect: 'postgres'
  }
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL Bağlantısı Başarılı!');
  } catch (error) {
    console.error('❌ Bağlantı Hatası:', error);
  }
};
module.exports = { sequelize, connectDB };
