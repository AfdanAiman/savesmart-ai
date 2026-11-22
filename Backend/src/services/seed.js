import { getDb } from '../db/index.js'
import { addDays, addMonths, monthOf, monthStart, today } from '../util.js'
import { notify } from './notify.js'

// Data contoh. Angka per kategori sama dengan layar Anggaran di desain Figma:
// Makanan 850.000, Transport 225.000, Hiburan 550.000, Lainnya 525.000.
// [judul, kategori, nominal, berapa hari lalu]
const EXPENSES = [
  ['Indomaret', 'Makanan', 52000, 0],
  ['Warung Makan Bu Tini', 'Makanan', 35000, 2],
  ['Kopi Kenangan', 'Makanan', 28000, 3],
  ['Superindo', 'Makanan', 215000, 5],
  ['Warteg Bahari', 'Makanan', 40000, 7],
  ['Pasar Kranggan', 'Makanan', 480000, 9],
  ['Gojek', 'Transport', 32000, 1],
  ['Bensin Pertamina', 'Transport', 150000, 4],
  ['Parkir Mall', 'Transport', 43000, 8],
  ['Netflix', 'Hiburan', 186000, 6],
  ['Bioskop XXI', 'Hiburan', 120000, 10],
  ['Top Up Game', 'Hiburan', 244000, 11],
  ['Pulsa Telkomsel', 'Lainnya', 100000, 3],
  ['Fotokopi dan ATK', 'Lainnya', 25000, 5],
  ['Skincare', 'Lainnya', 400000, 12],
]

const BUDGETS = [
  ['Makanan', 1000000],
  ['Transport', 500000],
  ['Hiburan', 500000],
  ['Lainnya', 1000000],
]

// Mengosongkan data milik user lalu mengisi ulang dengan data contoh.
export function seedDemo(userId) {
  const db = getDb()
  db.transaction(() => {
    for (const t of ['transactions', 'budgets', 'goals', 'notifications']) {
      db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId)
    }
    const t = today()
    const first = monthStart(t)
    // Tanggal tidak boleh keluar dari bulan berjalan supaya angka anggaran bulan ini tetap sama.
    const ago = (n) => { const d = addDays(t, -n); return d < first ? first : d }

    const tx = db.prepare('INSERT INTO transactions (user_id, title, category, amount, type, date, source) VALUES (?,?,?,?,?,?,?)')
    tx.run(userId, 'Uang Saku', 'Pemasukan', 2000000, 'income', first, 'manual')
    tx.run(userId, 'Kiriman Orang Tua', 'Pemasukan', 3000000, 'income', first, 'manual')
    for (const [title, cat, amount, n] of EXPENSES) {
      tx.run(userId, title, cat, amount, 'expense', ago(n), title === 'Indomaret' ? 'scan' : 'manual')
    }

    const b = db.prepare('INSERT INTO budgets (user_id, category, limit_amount, alert_at) VALUES (?,?,?,90)')
    for (const [cat, limit] of BUDGETS) b.run(userId, cat, limit)

    const goal = db.prepare('INSERT INTO goals (user_id, name, target_amount, deadline) VALUES (?,?,?,?)')
    const dep = db.prepare('INSERT INTO deposits (goal_id, amount, date) VALUES (?,?,?)')
    const laptop = goal.run(userId, 'Laptop Baru', 12000000, addMonths(t, 8)).lastInsertRowid
    dep.run(laptop, 2250000, addMonths(t, -3))
    dep.run(laptop, 975000, addMonths(t, -2))
    dep.run(laptop, 975000, addMonths(t, -1))
    const darurat = goal.run(userId, 'Dana Darurat', 5000000, null).lastInsertRowid
    dep.run(darurat, 1500000, addMonths(t, -1))

    // Notifikasi awal sesuai desain (urutan dibuat dari yang tertua)
    notify(userId, { kind: 'goal', title: 'Target Laptop Baru 35% tercapai', body: 'Tinggal Rp 7.800.000 lagi', link: `/target/${laptop}`, dedupeKey: `goal:${laptop}:25` })
    notify(userId, { kind: 'receipt', title: 'Struk Indomaret tersimpan', body: 'Rp 52.000 - kategori Makanan', link: '/report', dedupeKey: 'receipt:seed' })
    notify(userId, { kind: 'budget', title: 'Anggaran Hiburan terlampaui', body: 'Pengeluaran Rp 550.000 dari batas Rp 500.000', link: '/budget?alert=1', dedupeKey: `budget:over:Hiburan:${monthOf(t)}` })
  })()
}
