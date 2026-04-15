# OdevPortali

Öğrencilerin proje videosu yükleyip birbirlerinin videolarını değerlendirebildiği tam yığın bir uygulama.

## Özellikler

- Öğrenci kayıt ve giriş sistemi
- Proje videosu ve açıklaması yükleme
- Rastgele video atama
- Daha önce puanlanmamış videolara öncelik verme
- Video izlenmeden puan verme işlemini engelleme
- Ders bazlı değerlendirme limiti
- Kriter bazlı puanlama
- Hoca/admin paneli
- Ders, kriter, öğretmen ve öğrenci yönetimi
- YouTube video gömme ve oynatma

## Teknolojiler

- Frontend: React
- Backend: Node.js, Express
- ORM: Sequelize
- Veritabanı: PostgreSQL

## Proje Yapısı

- `backend/` - Express API, modeller ve veritabanı işlemleri
- `frontend/` - React arayüzü

## Gereksinimler

- Node.js 18+ önerilir
- PostgreSQL
- `npm`

## Kurulum

### 1. Backend

```bash
cd backend
npm install
```

`backend/.env` dosyasını kendi veritabanına göre ayarla:

```env
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=odev_portali
```

Backend varsayılan olarak `5000` portunda çalışır.

Çalıştırma:

```bash
node index.js
```

### 2. Frontend

```bash
cd frontend
npm install
```

Frontend, API adresini `REACT_APP_API_BASE_URL` değişkeninden okur. Yerel geliştirme için örnek:

```bash
$env:REACT_APP_API_BASE_URL="http://localhost:5000/api"
npm start
```

Alternatif olarak bu değeri sistem ortam değişkeni olarak da tanımlayabilirsin.

## Kullanım Akışı

1. Öğrenci kayıt olur ve giriş yapar.
2. Proje videosunu yükler.
3. Değerlendirme sayfasına girdiğinde sistem rastgele bir video atar.
4. Sistem, daha önce puanlanmış videoları dışarıda bırakır ve önce puanlanmamış videolara öncelik verir.
5. Video sonuna kadar izlenmeden puan gönderilemez.
6. Puanlar kriter bazlı olarak kaydedilir.

## API Kısa Notlar

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/submissions`
- `GET /api/assign-video/:userId/:dersKodu`
- `GET /api/criteria/:dersKodu`
- `POST /api/grades`
- `GET /api/courses`
- `POST /api/courses`
- `POST /api/settings/update-limit`

## Notlar

- Backend başlangıçta `sequelize.sync({ alter: true })` kullanır.
- Bu yüzden şema değişiklikleri geliştirme ortamında otomatik uygulanır.
- `frontend/temp-build-*` ve `.vscode/` klasörleri repoya dahil edilmez.

