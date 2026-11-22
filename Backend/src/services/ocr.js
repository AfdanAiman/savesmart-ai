import { z } from 'zod'
import { config } from '../config.js'
import { today } from '../util.js'

import { HttpError } from '../http.js'

// Kesalahan OCR memakai format error HTTP yang sama dengan bagian lain.
const OcrError = (code, message, status) => new HttpError(status, code, message)

// Kontrak hasil OCR (dipakai juga oleh layanan AI di ocr/ai-service):
// { store, date?, category?, accuracy?, items: [{name, price}], total? }
const resultSchema = z.object({
  store: z.string().min(1),
  date: z.string().optional(),
  category: z.enum(['Makanan', 'Transport', 'Hiburan', 'Lainnya']).optional(),
  accuracy: z.number().min(0).max(100).optional(),
  items: z.array(z.object({ name: z.string(), price: z.number().nonnegative() })).default([]),
  total: z.number().positive().optional(),
})

function normalize(raw) {
  const r = resultSchema.parse(raw)
  const sum = r.items.reduce((s, i) => s + i.price, 0)
  const total = Math.round(r.total ?? sum)
  if (!total) throw OcrError('UNREADABLE', 'Total pada struk tidak terbaca.', 422)
  return {
    store: r.store.trim(),
    date: r.date || today(),
    category: r.category || 'Lainnya',
    accuracy: Math.round(r.accuracy ?? 90),
    items: r.items,
    total,
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function mock({ simulateFail }) {
  await sleep(Number(process.env.OCR_MOCK_DELAY_MS ?? 1500))
  if (simulateFail) throw OcrError('UNREADABLE', 'Foto terlalu gelap atau buram.', 422)
  return normalize({
    store: 'Indomaret Kaliurang',
    category: 'Makanan',
    accuracy: 96,
    items: [
      { name: 'Susu UHT 1L', price: 18000 },
      { name: 'Roti Tawar', price: 16500 },
      { name: 'Mie Instan x5', price: 17500 },
    ],
  })
}

async function service({ file }) {
  const form = new FormData()
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'struk.jpg')
  let res
  try {
    res = await fetch(config.ocrUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) })
  } catch {
    throw OcrError('OCR_UNAVAILABLE', 'Layanan OCR tidak dapat dihubungi.', 502)
  }
  if (res.status === 422) throw OcrError('UNREADABLE', 'Struk tidak terbaca.', 422)
  if (!res.ok) throw OcrError('OCR_UNAVAILABLE', 'Layanan OCR gagal memproses struk.', 502)
  let json
  try {
    json = await res.json()
  } catch {
    throw OcrError('OCR_UNAVAILABLE', 'Respons layanan OCR tidak valid.', 502)
  }
  try {
    return normalize(json)
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw OcrError('OCR_UNAVAILABLE', 'Format respons layanan OCR tidak sesuai kontrak.', 502)
  }
}

export function scanReceipt({ file, simulateFail }) {
  if (config.ocrMode === 'service') {
    if (!file) throw OcrError('FILE_REQUIRED', 'Foto struk wajib diunggah.', 400)
    return service({ file })
  }
  return mock({ simulateFail }) // mode mock: foto boleh kosong
}
