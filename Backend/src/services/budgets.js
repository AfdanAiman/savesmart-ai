import { getDb } from '../db/index.js'
import { monthEnd, monthOf, monthStart, rp, today } from '../util.js'
import { notify } from './notify.js'

const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)

export function spentInMonth(userId, category, date = today()) {
  return getDb()
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM transactions
              WHERE user_id = ? AND type = 'expense' AND category = ? AND date BETWEEN ? AND ?`)
    .get(userId, category, monthStart(date), monthEnd(date)).s
}

function shape(row, spent) {
  return { category: row.category, limit: row.limit_amount, alertAt: row.alert_at, spent, pct: pctOf(spent, row.limit_amount) }
}

export function budgetStatus(userId, category) {
  const row = getDb().prepare('SELECT * FROM budgets WHERE user_id = ? AND category = ?').get(userId, category)
  return row ? shape(row, spentInMonth(userId, category)) : null
}

export function listBudgets(userId) {
  const rows = getDb().prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY rowid').all(userId)
  return rows.map((r) => shape(r, spentInMonth(userId, r.category)))
}

export function upsertBudget(userId, category, limit, alertAt) {
  getDb()
    .prepare(`INSERT INTO budgets (user_id, category, limit_amount, alert_at) VALUES (?,?,?,?)
              ON CONFLICT (user_id, category) DO UPDATE SET limit_amount = excluded.limit_amount, alert_at = excluded.alert_at`)
    .run(userId, category, limit, alertAt)
  return checkBudgetAlert(userId, category)
}

// Membuat notifikasi saat anggaran melewati ambang peringatan atau batasnya (sekali per bulan).
export function checkBudgetAlert(userId, category) {
  const b = budgetStatus(userId, category)
  if (!b) return null
  const month = monthOf(today())
  if (b.spent > b.limit) {
    notify(userId, {
      kind: 'budget',
      title: `Anggaran ${category} terlampaui`,
      body: `Pengeluaran ${rp(b.spent)} dari batas ${rp(b.limit)}`,
      link: '/budget?alert=1',
      dedupeKey: `budget:over:${category}:${month}`,
    })
  } else if (b.pct >= b.alertAt) {
    notify(userId, {
      kind: 'budget',
      title: `Anggaran ${category} hampir habis`,
      body: `${b.pct}% terpakai - sisa ${rp(b.limit - b.spent)}`,
      link: '/budget',
      dedupeKey: `budget:warn:${category}:${month}`,
    })
  }
  return b
}
