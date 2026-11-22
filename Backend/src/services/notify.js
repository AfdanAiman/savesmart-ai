import { getDb } from '../db/index.js'

// dedupeKey mencegah notifikasi yang sama dibuat dua kali (mis. anggaran yang sama di bulan yang sama).
export function notify(userId, { kind, title, body, link, dedupeKey = null }) {
  const r = getDb()
    .prepare('INSERT OR IGNORE INTO notifications (user_id, kind, title, body, link, dedupe_key) VALUES (?,?,?,?,?,?)')
    .run(userId, kind, title, body, link, dedupeKey)
  return r.changes > 0
}

export function listNotifications(userId) {
  return getDb()
    .prepare('SELECT id, kind, title, body, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100')
    .all(userId)
    .map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, to: n.link, read: !!n.is_read, createdAt: n.created_at }))
}
