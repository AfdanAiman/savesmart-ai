import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { getDb, closeDb } from './index.js'

const schemaPath = path.join(config.migrationsDir, '001_init.sql')
const sql = fs.readFileSync(schemaPath, 'utf8')

await getDb().query(sql)
console.log('Skema PostgreSQL (Neon) savesmart_ai berhasil dimigrasi.')
await closeDb()