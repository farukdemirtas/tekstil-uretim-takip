# Tekstil Uretim Takip Uygulamasi

Excel'de tutulan uretim takip tablosunun web tabanli versiyonu.

## Teknolojiler

- Frontend: Next.js (React + TypeScript + TailwindCSS)
- Backend: Node.js + Express
- Veritabani: SQLite
- Bonus: Gunluk toplam, Excel export, admin panel ozeti
- Ekstra: Kullanici girisi, toplu veri girisi

## Ozellikler

- Excel benzeri tablo gorunumu (`No`, `Ad Soyad`, `Proses`, saat kolonlari, `Toplam`)
- Grup bazli listeleme (`SAG ON`, `SOL ON`)
- Saat kolonlarina veri girisi ve otomatik toplam hesaplama
- Tarih secimi ile tarih bazli veri saklama
- Veritabanina kaydetme ve yenilemede veriyi geri yukleme
- Yeni calisan ekleme formu (ad, grup, proses)
- Kullanici girisi (login/logout, token kontrollu API)
- Toplu veri girisi (Excel'den kopyala-yapistir, tek seferde kaydet)
- Kurumsal ve temiz arayuz (TailwindCSS)

## Proje Yapisi

```text
tekstil-uretim-takip/
  backend/
    src/
      db.js
      queries.js
      server.js
    data/
  frontend/
    src/
      app/
        layout.tsx
        page.tsx
      components/
        WorkerForm.tsx
        ProductionTable.tsx
        AdminPanel.tsx
      lib/
        api.ts
        types.ts
```

## Kurulum

> Not: Bilgisayarda Node.js 18+ kurulu olmalidir.

1) Klasore gir:

```bash
cd tekstil-uretim-takip
```

2) Tum bagimliliklari yukle:

```bash
npm install
npm run install:all
```

3) Frontend ortam dosyasini olustur:

```bash
copy frontend\\.env.local.example frontend\\.env.local
```

4) Uygulamayi calistir:

```bash
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

## Ayrı Ayrı Calistirma

Backend:

```bash
npm run dev:backend
```

Frontend:

```bash
npm run dev:frontend
```

## API Endpointleri

- `GET /api/health`
- `GET /api/workers`
- `POST /api/workers`
- `DELETE /api/workers/:id`
- `GET /api/production?date=YYYY-MM-DD`
- `POST /api/production`
- `POST /api/production/bulk`
- `POST /api/auth/login`
- `GET /api/analytics/top-workers?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=20`
- `GET /api/analytics/daily-trend?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

## Gelistirme Notlari

- Veri girisleri hucre degistikce kaydedilir.
- Toplu veri girisinde format: `Ad Soyad[TAB]10:00[TAB]13:00[TAB]16:00[TAB]18:30`
- `production_entries` tablosunda `worker_id + production_date` benzersizdir.
- SQLite dosyasi: `backend/data/production.db` (gelistirme). Uretim: `ecosystem.config.cjs` icinde `TEKSTIL_DB_PATH` (ornek sunucu dizini `/var/www/uretim-takip`); ayrintilar `deploy/VPS-KURULUM.md`.

Isterseniz backend icin ortam degiskenleri tanimlayarak degistirebilirsiniz:

- `APP_USERNAME`
- `APP_PASSWORD`
- `APP_TOKEN`
