import { getDb } from '../db/index.js'
import { addMonths, monthsBetween, rp, today } from '../util.js'
import { notify } from './notify.js'

const MILESTONES = [100, 75, 50, 25]

function shape(g) {
  const db = getDb()
  const saved = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM deposits WHERE goal_id = ?').get(g.id).s
  const deposits = db
    .prepare('SELECT id, amount, date FROM deposits WHERE goal_id = ? ORDER BY date DESC, id DESC LIMIT 30')
    .all(g.id)
  const monthsLeft = g.deadline ? monthsBetween(today(), g.deadline) : null
  const remaining = Math.max(g.target_amount - saved, 0)
  return {
    id: g.id,
    name: g.name,
    target: g.target_amount,
    saved,
    pct: Math.min(100, Math.round((saved / g.target_amount) * 100)),
    deadline: g.deadline,
    monthsLeft,
    // Kebutuhan tabungan per bulan = sisa target / sisa bulan (dibulatkan ke atas)
    monthlyNeed: monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : null,
    deposits,
  }
}

export function listGoals(userId) {
  return getDb().prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY id').all(userId).map(shape)
}

export function getGoal(userId, id) {
  const g = getDb().prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, userId)
  return g ? shape(g) : null
}

export function createGoal(userId, { name, target, months }) {
  const deadline = addMonths(today(), months)
  const r = getDb()
    .prepare('INSERT INTO goals (user_id, name, target_amount, deadline) VALUES (?,?,?,?)')
    .run(userId, name, target, deadline)
  return getGoal(userId, r.lastInsertRowid)
}

export function addDeposit(userId, id, amount) {
  const before = getGoal(userId, id)
  if (!before) return null
  getDb().prepare('INSERT INTO deposits (goal_id, amount, date) VALUES (?,?,?)').run(id, amount, today())
  const after = getGoal(userId, id)

  // Notifikasi kemajuan: hanya milestone tertinggi yang baru terlewati
  const reached = MILESTONES.find((m) => after.pct >= m && before.pct < m)
  if (reached) {
    notify(userId, {
      kind: 'goal',
      title: reached >= 100 ? `Target ${after.name} tercapai` : `Target ${after.name} ${after.pct}% tercapai`,
      body: reached >= 100 ? 'Selamat, targetmu sudah terkumpul' : `Tinggal ${rp(after.target - after.saved)} lagi`,
      link: `/target/${id}`,
      dedupeKey: `goal:${id}:${reached}`,
    })
  }
  return after
}
