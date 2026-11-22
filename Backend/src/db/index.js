import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite' // SQLite bawaan Node.js (>= 22.13), tanpa paket native
import { config } from '../config.js'

let db

export function getDb() {
  if (db) return db
  if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })
  db = new DatabaseSync(config.dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  // Pembungkus transaksi: fn dijalankan atomik (batal semua kalau ada error).
  db.transaction = (fn) => (...args) => {
    db.exec('BEGIN IMMEDIATE')
    try {
      const r = fn(...args)
      db.exec('COMMIT')
      return r
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  migrate(db)
  return db
}

export function closeDb() {
  db?.close()
  db = undefined
}

// Menjalankan file .sql di Database/migrations secara berurutan, satu kali per file.
export function migrate(d = getDb()) {
  d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  if (!fs.existsSync(config.migrationsDir)) {
    throw new Error(`Folder migrasi tidak ditemukan: ${config.migrationsDir}`)
  }
  const files = fs.readdirSync(config.migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  const done = new Set(d.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name))
  for (const f of files) {
    if (done.has(f)) continue
    const sql = fs.readFileSync(path.join(config.migrationsDir, f), 'utf8')
    d.transaction(() => {
      d.exec(sql)
      d.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(f, new Date().toISOString())
    })()
    console.log(`migrasi dijalankan: ${f}`)
  }
}
