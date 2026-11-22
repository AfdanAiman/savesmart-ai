import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const isProd = process.env.NODE_ENV === 'production'

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET wajib diisi saat NODE_ENV=production')
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-ganti-di-production',
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  // Asal frontend yang diizinkan (pisahkan dengan koma)
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'savesmart.db'),
  migrationsDir: process.env.MIGRATIONS_DIR || path.resolve(root, '..', 'Database', 'migrations'),
  // Isi akun baru dengan data contoh agar dashboard tidak kosong saat demo
  seedOnRegister: (process.env.SEED_ON_REGISTER ?? 'true') === 'true',
  // OCR: 'mock' (hasil contoh) atau 'service' (panggil layanan AI di ocr/ai-service)
  ocrMode: process.env.OCR_MODE || 'mock',
  ocrUrl: process.env.OCR_SERVICE_URL || 'http://localhost:5000/scan',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 8,
}

export const CATEGORIES = ['Makanan', 'Transport', 'Hiburan', 'Lainnya']
