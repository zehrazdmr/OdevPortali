# OdevPortali Frontend

Bu proje, öğrencilerin proje videosu yükleyip başka öğrencilerin videolarını izleyerek puan verebildiği bir değerlendirme sisteminin React arayüzüdür.

## Proje İçeriği

- Kullanıcı kayıt ve giriş ekranları
- Öğrenci paneli
- Proje videosu yükleme
- Değerlendirme sayfası
- Rastgele video oynatma ve puanlama
- Hoca/admin ekranları
- Ders, kriter ve limit yönetimi

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

### 2. Bağımlılıkları yükle

```bash
cd frontend
npm install
```

### 3. API adresini ayarla

Frontend, backend adresini `REACT_APP_API_BASE_URL` değişkeninden okur. Yerel geliştirme için örnek:

```powershell
$env:REACT_APP_API_BASE_URL="http://localhost:5000/api"
```

### 4. Uygulamayı başlat

```bash
npm start
```

Ardından uygulama genellikle `http://localhost:3000` adresinde açılır.

## Not

Backend’in de çalışıyor olması gerekir. Frontend, backend olmadan tam olarak çalışmaz.
