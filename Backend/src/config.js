import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const isProd = process.env.NODE_ENV === 'production'

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET wajib diisi saat NODE_ENV=production')
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL wajib diisi di file .env')
}

export const config = {
  isProd,

  port: Number(process.env.PORT) || 4000,

  jwtSecret: process.env.JWT_SECRET,

  jwtExpires: process.env.JWT_EXPIRES || '7d',

  corsOrigins: String(
    process.env.CORS_ORIGINS ||
      'http://localhost:5173,http://localhost:4173'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    url: process.env.DATABASE_URL,
  },

  migrationsDir:
    process.env.MIGRATIONS_DIR ||
    path.resolve(root, '..', 'Database', 'migrations'),

  seedOnRegister:
    (process.env.SEED_ON_REGISTER ?? 'true') === 'true',

  // OCR Gemini
  ocrMode: process.env.OCR_MODE || 'mock',

  ocrUrl:
    process.env.OCR_SERVICE_URL ||
    'https://generativelanguage.googleapis.com/v1beta/models',

  aiApiKey: process.env.GEMINI_API_KEY || '',

  aiModel:
    process.env.GEMINI_MODEL || 'gemini-3.5-flash',

  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 8,
}

export const CATEGORIES = [
  'Makanan',
  'Transport',
  'Hiburan',
  'Belanja',
  'Tagihan',
  'Kesehatan',
  'Pendidikan',
  'Lainnya',
]

export const INCOME_CATEGORIES = [
  'Uang Saku',
  'Gaji',
  'Bonus',
  'Hadiah',
  'Lainnya',
]