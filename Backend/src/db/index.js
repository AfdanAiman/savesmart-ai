import pg from 'pg'
import { config } from '../config.js'

// Mengubah BIGINT (OID 20) dari string menjadi Number agar perhitungan uang tetap aman
pg.types.setTypeParser(20, (val) => Number(val))

let pool

// Mengubah placeholder ? (MySQL) menjadi $1, $2, ... (PostgreSQL) secara otomatis
function toPgSql(sql) {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

// Menambahkan RETURNING id pada query INSERT agar result.insertId tetap berfungsi
// Kecuali tabel budgets yang tidak memiliki kolom id
function withReturningId(sql) {
  const trimmed = sql.trim().replace(/;$/, '')
  if (
    /^INSERT\s+INTO/i.test(trimmed) &&
    !/^INSERT\s+INTO\s+budgets\b/i.test(trimmed) &&
    !/\bRETURNING\b/i.test(trimmed) &&
    !/\bON\s+CONFLICT\b/i.test(trimmed)
  ) {
    return `${trimmed} RETURNING id`
  }
  return trimmed
}

function formatResult(res) {
  if (res.command === 'SELECT') {
    return res.rows
  }
  return {
    affectedRows: res.rowCount ?? 0,
    insertId: res.rows?.[0]?.id ?? null,
    rows: res.rows,
  }
}

export function getDb() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.db.url,
      ssl: { rejectUnauthorized: false },
      max: 10,
    })
  }
  return pool
}

export async function query(sql, params = []) {
  const pgSql = withReturningId(toPgSql(sql))
  const res = await getDb().query(pgSql, params)
  return formatResult(res)
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params)
  return Array.isArray(rows) ? (rows[0] ?? null) : null
}

export async function withTransaction(fn) {
  const client = await getDb().connect()
  await client.query('BEGIN')
  try {
    const txWrapper = {
      query: (sql, params = []) => client.query(withReturningId(toPgSql(sql)), params),
      execute: async (sql, params = []) => {
        const pgSql = withReturningId(toPgSql(sql))
        const res = await client.query(pgSql, params)
        return [formatResult(res)]
      },
    }
    const result = await fn(txWrapper)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}