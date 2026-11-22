// Mengisi ulang data contoh untuk satu akun: npm run db:seed -- email@contoh.com
import { getDb, closeDb } from './index.js'
import { seedDemo } from '../services/seed.js'

const email = process.argv[2]
if (!email) {
  console.error('Pakai: npm run db:seed -- email@contoh.com')
  process.exit(1)
}
const u = getDb().prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase())
if (!u) {
  console.error('Akun tidak ditemukan.')
  process.exit(1)
}
seedDemo(u.id)
console.log('Data contoh dimuat untuk', email)
closeDb()
