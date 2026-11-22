-- SaveSmart AI - skema awal (SQLite)
-- Nominal uang disimpan sebagai bilangan bulat dalam Rupiah.
-- Tanggal disimpan sebagai teks ISO (YYYY-MM-DD untuk tanggal, ISO 8601 untuk waktu).

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE transactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  category   TEXT    NOT NULL CHECK (category IN ('Makanan','Transport','Hiburan','Lainnya','Pemasukan')),
  amount     INTEGER NOT NULL CHECK (amount > 0),
  type       TEXT    NOT NULL CHECK (type IN ('expense','income')),
  date       TEXT    NOT NULL,                       -- YYYY-MM-DD
  source     TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','scan')),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_tx_user_date ON transactions(user_id, date DESC, id DESC);

CREATE TABLE budgets (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     TEXT    NOT NULL CHECK (category IN ('Makanan','Transport','Hiburan','Lainnya')),
  limit_amount INTEGER NOT NULL CHECK (limit_amount > 0),
  alert_at     INTEGER NOT NULL DEFAULT 90 CHECK (alert_at BETWEEN 50 AND 99),
  PRIMARY KEY (user_id, category)
);

CREATE TABLE goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  target_amount INTEGER NOT NULL CHECK (target_amount > 0),
  deadline      TEXT,                                -- YYYY-MM-DD, boleh kosong
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_goals_user ON goals(user_id);

CREATE TABLE deposits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  date       TEXT    NOT NULL,                       -- YYYY-MM-DD
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_deposits_goal ON deposits(goal_id, date DESC, id DESC);

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('budget','receipt','goal')),
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  link       TEXT    NOT NULL,                       -- rute frontend tujuan
  dedupe_key TEXT,                                   -- mencegah notifikasi ganda
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX idx_notif_user ON notifications(user_id, id DESC);
