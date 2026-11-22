import { getDb } from '../db/index.js'
import { addDays, addMonths, dayOfWeek, monthEnd, monthStart, rp, today } from '../util.js'
import { checkBudgetAlert } from './budgets.js'
import { notify } from './notify.js'

const signed = (t) => ({
  id: t.id, title: t.title, category: t.category,
  amount: t.type === 'expense' ? -t.amount : t.amount,
  type: t.type, date: t.date, source: t.source,
})

export function listTransactions(userId, { limit = 50, category, from, to } = {}) {
  const where = ['user_id = ?']
  const args = [userId]
  if (category) { where.push('category = ?'); args.push(category) }
  if (from) { where.push('date >= ?'); args.push(from) }
  if (to) { where.push('date <= ?'); args.push(to) }
  return getDb()
    .prepare(`SELECT * FROM transactions WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC LIMIT ?`)
    .all(...args, limit)
    .map(signed)
}

export function addTransaction(userId, { title, category, amount, type, date, source }) {
  const db = getDb()
  const r = db
    .prepare('INSERT INTO transactions (user_id, title, category, amount, type, date, source) VALUES (?,?,?,?,?,?,?)')
    .run(userId, title, category, amount, type, date, source)
  const tx = signed(db.prepare('SELECT * FROM transactions WHERE id = ?').get(r.lastInsertRowid))

  let budget = null
  if (type === 'expense') budget = checkBudgetAlert(userId, category)
  if (source === 'scan') {
    notify(userId, {
      kind: 'receipt',
      title: `Struk ${title.split(' ')[0]} tersimpan`,
      body: `${rp(amount)} - kategori ${category}`,
      link: '/report',
      dedupeKey: `receipt:${tx.id}`,
    })
  }
  return { transaction: tx, budget }
}

// Ringkasan: pemasukan & pengeluaran bulan ini, saldo = seluruh pemasukan - seluruh pengeluaran.
export function summary(userId) {
  const db = getDb()
  const t = today()
  const month = db
    .prepare(`SELECT type, COALESCE(SUM(amount),0) AS s FROM transactions
              WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY type`)
    .all(userId, monthStart(t), monthEnd(t))
  const all = db
    .prepare('SELECT type, COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id = ? GROUP BY type')
    .all(userId)
  const pick = (rows, type) => rows.find((r) => r.type === type)?.s ?? 0
  return {
    income: pick(month, 'income'),
    expense: pick(month, 'expense'),
    balance: pick(all, 'income') - pick(all, 'expense'),
  }
}

// ---------- Laporan ----------
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const MONTH_LETTER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function report(userId, range) {
  const t = today()
  let buckets // [{label, from, to}]
  let title
  if (range === 'week') {
    title = 'Pengeluaran 7 hari terakhir'
    buckets = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(t, i - 6)
      return { label: DAYS[dayOfWeek(d)], from: d, to: d }
    })
  } else if (range === 'month') {
    title = 'Pengeluaran 4 minggu terakhir'
    buckets = Array.from({ length: 4 }, (_, i) => {
      const to = addDays(t, -7 * (3 - i))
      return { label: `Mg ${i + 1}`, from: addDays(to, -6), to }
    })
  } else {
    title = 'Pengeluaran 12 bulan terakhir'
    buckets = Array.from({ length: 12 }, (_, i) => {
      const d = addMonths(monthStart(t), i - 11)
      return { label: MONTH_LETTER[Number(d.slice(5, 7)) - 1], from: monthStart(d), to: monthEnd(d) }
    })
  }

  const db = getDb()
  const sum = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions
                          WHERE user_id = ? AND type = 'expense' AND date BETWEEN ? AND ?`)
  const values = buckets.map((b) => sum.get(userId, b.from, b.to).s)

  const from = buckets[0].from
  const to = buckets[buckets.length - 1].to
  const byCat = db
    .prepare(`SELECT category, SUM(amount) AS s FROM transactions
              WHERE user_id = ? AND type = 'expense' AND date BETWEEN ? AND ? GROUP BY category`)
    .all(userId, from, to)
  const total = byCat.reduce((a, c) => a + c.s, 0)
  const categories = ['Makanan', 'Transport', 'Hiburan', 'Lainnya'].map((name) => {
    const amount = byCat.find((c) => c.category === name)?.s ?? 0
    return { name, amount, pct: total ? Math.round((amount / total) * 100) : 0 }
  })

  return { range, title, labels: buckets.map((b) => b.label), values, total, categories }
}
