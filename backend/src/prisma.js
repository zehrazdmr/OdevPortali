const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

prisma.$connect()
  .then(() => console.log('✅ MySQL (Prisma) bağlantısı başarılı'))
  .catch((e) => console.error('❌ Veritabanı bağlantı hatası:', e.message));

module.exports = prisma;
