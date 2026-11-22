# SaveSmart AI - Backend

REST API dengan **Node.js + Express + SQLite**. Skema database ada di `../Database/migrations`.

**Butuh Node.js 22.13 atau lebih baru** (cek dengan `node -v`; unduh versi LTS dari https://nodejs.org).
SQLite memakai modul bawaan Node, jadi tidak ada paket native yang perlu dikompilasi. Peringatan
`ExperimentalWarning: SQLite is an experimental feature` saat server menyala adalah normal.

## Menjalankan

```bash
cd Backend
npm install
cp .env.example .env     # Windows PowerShell: Copy-Item .env.example .env
npm run dev              # http://localhost:4000
npm test                 # 11 tes otomatis (database sementara di memori)
```

Tabel dibuat otomatis saat server pertama kali berjalan. File database ada di `Backend/data/` (tidak ikut Git).
Jalankan frontend di terminal lain (`cd Frontend && npm run dev`); permintaan `/api` otomatis diteruskan ke port 4000.

Perintah lain: `npm run db:migrate` (hanya migrasi) dan `npm run db:seed -- email@contoh.com` (isi ulang data contoh satu akun).

## Aturan penting

- Semua nominal berupa **bilangan bulat Rupiah**. Pengeluaran bertanda negatif di respons transaksi.
- Semua endpoint selain `/api/auth/*` dan `/api/health` butuh header `Authorization: Bearer <token>`.
- Data selalu dibatasi per akun; mengakses data akun lain mengembalikan 404.
- Peringatan anggaran dibuat otomatis (sekali per kategori per bulan): saat terpakai >= ambang (`alertAt`) dan saat terlampaui.
- Notifikasi target dibuat saat tabungan melewati 25%, 50%, 75%, dan 100%.
- Format error: `{ "error": "KODE", "message": "...", "fields": { "namaField": "..." } }`.

## Endpoint

| Metode | Alamat | Fungsi |
|---|---|---|
| POST | `/api/auth/register` | Daftar `{name, email, password}` -> `{token, user}` |
| POST | `/api/auth/login` | Masuk `{email, password}` -> `{token, user}` |
| GET | `/api/auth/me` | Data akun yang sedang masuk |
| GET | `/api/summary` | Pemasukan & pengeluaran bulan ini, saldo |
| GET | `/api/transactions?limit=` | Daftar transaksi terbaru |
| POST | `/api/transactions` | Catat `{title, amount, category, type?, date?, source?}` -> `{transaction, budget}` |
| GET | `/api/budgets` | Anggaran + terpakai bulan ini |
| PUT | `/api/budgets/:category` | Atur `{limit, alertAt}` |
| GET | `/api/goals` | Daftar target + riwayat setoran |
| POST | `/api/goals` | Buat `{name, target, months}` |
| GET | `/api/goals/:id` | Detail target |
| POST | `/api/goals/:id/deposits` | Setor `{amount}` |
| GET | `/api/notifications` | Daftar notifikasi |
| POST | `/api/notifications/:id/read` | Tandai dibaca (`/read-all` untuk semua) |
| GET | `/api/report?range=week\|month\|year` | Data grafik + porsi per kategori |
| POST | `/api/scan` | Unggah foto struk (form field `receipt`) -> hasil OCR |
| POST | `/api/demo/reset` | Kembalikan data contoh akun ini |

Kategori: `Makanan`, `Transport`, `Hiburan`, `Lainnya` (pemasukan otomatis `Pemasukan`).

## Menyambungkan layanan OCR (untuk AI Developer)

Saat ini `OCR_MODE=mock` mengembalikan hasil contoh. Untuk memakai layanan di `ocr/ai-service`, atur
`OCR_MODE=service` dan `OCR_SERVICE_URL`. Backend akan mengirim `POST multipart/form-data` dengan field `file` (foto struk).
Layanan harus membalas JSON:

```json
{
  "store": "Indomaret Kaliurang",
  "date": "2026-11-22",
  "category": "Makanan",
  "accuracy": 96,
  "items": [{ "name": "Susu UHT 1L", "price": 18000 }],
  "total": 52000
}
```

Hanya `store` yang wajib. `total` boleh dikosongkan (dijumlah dari `items`), `category` bernilai salah satu dari empat kategori
(default `Lainnya`). Balas status **422** kalau struk tidak terbaca; backend meneruskannya sebagai `UNREADABLE`
sehingga frontend menampilkan layar "Struk Tidak Terbaca". Status lain yang bukan 2xx dianggap layanan tidak tersedia (502).

## Sebelum production

- Isi `JWT_SECRET` dengan nilai acak (server menolak berjalan tanpa itu saat `NODE_ENV=production`).
- Set `SEED_ON_REGISTER=false` dan `CORS_ORIGINS` ke alamat frontend yang sebenarnya.
- Jalankan di belakang HTTPS.
