-- SaveSmart AI - migrasi 002: kebutuhan frontend versi web (desain Figma 20 layar)
-- Hanya MENAMBAH kolom / melonggarkan aturan. Data lama tetap utuh.

-- Profil & preferensi pengguna (layar Profil)
ALTER TABLE users ADD COLUMN phone         TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN language      TEXT    NOT NULL DEFAULT 'id';
ALTER TABLE users ADD COLUMN currency      TEXT    NOT NULL DEFAULT 'IDR';
ALTER TABLE users ADD COLUMN budget_period TEXT    NOT NULL DEFAULT 'monthly';
ALTER TABLE users ADD COLUMN notif_budget  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notif_goal    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notif_weekly  INTEGER NOT NULL DEFAULT 0;

-- Target tabungan: bisa dinonaktifkan, dan durasi bulan disimpan (kosong = fleksibel)
ALTER TABLE goals ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'));
ALTER TABLE goals ADD COLUMN months INTEGER;

-- Setoran boleh punya catatan
ALTER TABLE deposits ADD COLUMN note TEXT NOT NULL DEFAULT '';

-- Transaksi: kategori lebih banyak (Belanja, Tagihan, dst.) dan catatan.
-- SQLite tidak bisa mengubah aturan CHECK, jadi tabel dibangun ulang.
CREATE TABLE transactions_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  category   TEXT    NOT NULL,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  type       TEXT    NOT NULL CHECK (type IN ('expense','income')),
  date       TEXT    NOT NULL,
  source     TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','scan')),
  note       TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO transactions_new (id, user_id, title, category, amount, type, date, source, created_at)
  SELECT id, user_id, title, category, amount, type, date, source, created_at FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;
CREATE INDEX idx_tx_user_date ON transactions(user_id, date DESC, id DESC);

-- Anggaran: kategori lebih banyak
CREATE TABLE budgets_new (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     TEXT    NOT NULL,
  limit_amount INTEGER NOT NULL CHECK (limit_amount > 0),
  alert_at     INTEGER NOT NULL DEFAULT 90 CHECK (alert_at BETWEEN 50 AND 99),
  PRIMARY KEY (user_id, category)
);
INSERT INTO budgets_new (user_id, category, limit_amount, alert_at)
  SELECT user_id, category, limit_amount, alert_at FROM budgets;
DROP TABLE budgets;
ALTER TABLE budgets_new RENAME TO budgets;
