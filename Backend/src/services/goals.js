import { getDb } from '../db/index.js'
import { addMonths, monthsBetween, rp, today } from '../util.js'
import { notify } from './notify.js'

const MILESTONES = [100, 75, 50, 25]

function shape(g) {
  const db = getDb()
  const saved = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM deposits WHERE goal_id = ?').get(g.id).s
  const deposits = db
    .prepare('SELECT id, amount, date, note FROM deposits WHERE goal_id = ? ORDER BY date DESC, id DESC LIMIT 30')
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
    months: g.months ?? null,
    active: g.status !== 'inactive',
    monthsLeft,
    // Kebutuhan tabungan per bulan = sisa target / sisa bulan (dibulatkan ke atas)
    monthlyNeed: monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : null,
    deposits,
  }
}

export function listGoals(userId, status) {
  const rows = status
    ? getDb().prepare('SELECT * FROM goals WHERE user_id = ? AND status = ? ORDER BY id').all(userId, status)
    : getDb().prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY id').all(userId)
  return rows.map(shape)
}

export function getGoal(userId, id) {
  const g = getDb().prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, userId)
  return g ? shape(g) : null
}

// months kosong = target fleksibel (tanpa tenggat). initialAmount = tabungan awal (dicatat sebagai setoran pertama).
export function createGoal(userId, { name, target, months, initialAmount }) {
  const deadline = months ? addMonths(today(), months) : null
  const db = getDb()
  const id = db.transaction(() => {
    const r = db
      .prepare('INSERT INTO goals (user_id, name, target_amount, deadline, months) VALUES (?,?,?,?,?)')
      .run(userId, name, target, deadline, months ?? null)
    if (initialAmount) {
      db.prepare('INSERT INTO deposits (goal_id, amount, date, note) VALUES (?,?,?,?)')
        .run(r.lastInsertRowid, initialAmount, today(), 'Tabungan awal')
    }
    return r.lastInsertRowid
  })()
  return getGoal(userId, id)
}

// Ubah nama / nominal / durasi target. Setoran yang sudah tercatat tidak berubah.
export function updateGoal(userId, id, { name, target, months }) {
  const g = getDb().prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, userId)
  if (!g) return null
  const deadline = months ? addMonths(today(), months) : null
  getDb()
    .prepare('UPDATE goals SET name = ?, target_amount = ?, deadline = ?, months = ? WHERE id = ?')
    .run(name, target, deadline, months ?? null, id)
  return getGoal(userId, id)
}

export function setGoalStatus(userId, id, status) {
  const r = getDb().prepare('UPDATE goals SET status = ? WHERE id = ? AND user_id = ?').run(status, id, userId)
  return r.changes ? getGoal(userId, id) : null
}

export function addDeposit(userId, id, amount, { date = today(), note = '' } = {}) {
  const before = getGoal(userId, id)
  if (!before) return null
  getDb().prepare('INSERT INTO deposits (goal_id, amount, date, note) VALUES (?,?,?,?)').run(id, amount, date, note)
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
