-- SaveSmart AI - Skema Database PostgreSQL (Neon)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(30)  NOT NULL DEFAULT '',
  language      VARCHAR(10)  NOT NULL DEFAULT 'id',
  currency      VARCHAR(10)  NOT NULL DEFAULT 'IDR',
  budget_period VARCHAR(20)  NOT NULL DEFAULT 'monthly',
  notif_budget  SMALLINT     NOT NULL DEFAULT 1 CHECK (notif_budget IN (0,1)),
  notif_goal    SMALLINT     NOT NULL DEFAULT 1 CHECK (notif_goal IN (0,1)),
  notif_weekly  SMALLINT     NOT NULL DEFAULT 0 CHECK (notif_weekly IN (0,1)),
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id         SERIAL PRIMARY KEY,
  user_id    INT          NOT NULL,
  title      VARCHAR(150) NOT NULL,
  category   VARCHAR(50)  NOT NULL,
  amount     BIGINT       NOT NULL,
  type       VARCHAR(10)  NOT NULL CHECK (type IN ('expense','income')),
  date       VARCHAR(10)  NOT NULL,
  source     VARCHAR(10)  NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','scan')),
  note       VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions (user_id, date DESC, id DESC);

CREATE TABLE IF NOT EXISTS budgets (
  user_id      INT         NOT NULL,
  category     VARCHAR(50) NOT NULL,
  limit_amount BIGINT      NOT NULL,
  alert_at     INT         NOT NULL DEFAULT 90,
  PRIMARY KEY (user_id, category),
  CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS goals (
  id            SERIAL PRIMARY KEY,
  user_id       INT          NOT NULL,
  name          VARCHAR(100) NOT NULL,
  target_amount BIGINT       NOT NULL,
  deadline      VARCHAR(10)  NULL,
  status        VARCHAR(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  months        INT          NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals (user_id);

CREATE TABLE IF NOT EXISTS deposits (
  id         SERIAL PRIMARY KEY,
  goal_id    INT          NOT NULL,
  amount     BIGINT       NOT NULL,
  date       VARCHAR(10)  NOT NULL,
  note       VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_deposits_goal FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deposits_goal ON deposits (goal_id, date DESC, id DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INT          NOT NULL,
  kind       VARCHAR(10)  NOT NULL CHECK (kind IN ('budget','receipt','goal')),
  title      VARCHAR(150) NOT NULL,
  body       TEXT         NOT NULL,
  link       VARCHAR(150) NOT NULL,
  dedupe_key VARCHAR(150) NULL,
  is_read    SMALLINT     NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_notif_dedupe UNIQUE (user_id, dedupe_key),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, id DESC);