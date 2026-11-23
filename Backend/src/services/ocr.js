import sharp from 'sharp'
import { CATEGORIES, config } from '../config.js'
import { HttpError } from '../http.js'
import { today } from '../util.js'

const MOCK_RESULT = {
  title: 'Indomaret Point',
  amount: 45500,
  category: 'Makanan',
  date: today(),
  confidence: 0.95,
  rawText: 'INDOMARET POINT - TOTAL RP 45.500',
}

// Daftar model Gemini Multimodal berurutan dari yang paling stabil & cepat
const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.5-pro',
]

export async function scanReceipt({ file, simulateFail = false }) {
  if (!file) {
    throw new HttpError(400, 'NO_FILE', 'Foto struk wajib diunggah.')
  }
  if (simulateFail) {
    throw new HttpError(422, 'OCR_FAILED', 'Struk tidak terbaca, coba foto ulang dengan cahaya lebih terang.')
  }

  if (config.ocrMode !== 'service') {
    return { ...MOCK_RESULT, date: today() }
  }

  const apiKey = String(config.aiApiKey || '').trim()
  if (!apiKey) {
    throw new HttpError(500, 'OCR_CONFIG_ERROR', 'GEMINI_API_KEY belum diatur di server.')
  }

  const compressedBuffer = await sharp(file.buffer)
    .rotate()
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()

  const base64Image = compressedBuffer.toString('base64')

  const prompt = `Kamu adalah sistem ekstraksi struk belanja Indonesia. Analisis gambar struk ini dan kembalikan HANYA objek JSON valid tanpa markdown atau teks tambahan.
Format wajib:
{
  "title": "Nama toko atau merchant singkat",
  "amount": 50000,
  "category": "Pilih persis salah satu: ${CATEGORIES.join(', ')}",
  "date": "YYYY-MM-DD (jika tidak terbaca di struk, isi null)"
}
Aturan:
- "amount" wajib berupa angka bulat (integer) dalam Rupiah tanpa titik/koma (contoh: 45500).
- Jika gambar bukan struk belanja atau sama sekali tidak terbaca, kembalikan {"error": "UNREADABLE"}.`

  // Bersihkan base URL jika terlanjur berisi akhiran /:generateContent
  const baseUrl = config.ocrUrl.replace(/\/[^/]+:generateContent$/, '').replace(/\/$/, '')
  const candidates = [...new Set([...GEMINI_MODELS, config.aiModel])].filter(Boolean)

  let data = null
  let lastError = ''

  for (const modelName of candidates) {
    const endpoint = `${baseUrl}/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      })

      if (response.ok) {
        data = await response.json()
        console.log(`OCR Gemini berhasil diproses dengan model: ${modelName}`)
        break
      }

      lastError = await response.text()
      console.warn(`Model Gemini ${modelName} dilewati (${response.status}):`, lastError)

      if (response.status === 403 || lastError.includes('API_KEY_INVALID')) {
        throw new HttpError(502, 'OCR_AUTH_ERROR', 'GEMINI_API_KEY tidak valid. Periksa kembali key di .env.')
      }
    } catch (err) {
      if (err instanceof HttpError) throw err
      lastError = err.message
      console.warn(`Koneksi ke model ${modelName} terputus:`, err.message)
    }
  }

  if (!data) {
    console.error('Semua model Gemini gagal:', lastError)
    throw new HttpError(502, 'OCR_PROVIDER_ERROR', 'Layanan AI pemindai struk sedang sibuk, coba lagi sebentar.')
  }

  const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  console.log('Raw response dari Gemini:', rawContent)

  const cleanJson = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleanJson)
    if (Array.isArray(parsed)) {
      parsed = parsed[0] || {}
    }
  } catch {
    console.error('Gagal parse JSON dari Gemini:', rawContent)
    throw new HttpError(422, 'OCR_PARSE_ERROR', 'Hasil pembacaan AI tidak valid, silakan input manual.')
  }

  const cleanAmount = typeof parsed.amount === 'string'
    ? Number(parsed.amount.replace(/[^\d]/g, ''))
    : Number(parsed.amount)

  if (parsed.error === 'UNREADABLE' || !cleanAmount || cleanAmount <= 0) {
    console.warn('Validasi OCR gagal, hasil parsed:', parsed)
    throw new HttpError(422, 'OCR_FAILED', 'Struk tidak terbaca dengan jelas, pastikan foto fokus dan terang.')
  }

  const validCategory = CATEGORIES.includes(parsed.category) ? parsed.category : 'Lainnya'
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) && parsed.date <= today() ? parsed.date : today()

  return {
    title: String(parsed.title || 'Transaksi Struk').slice(0, 100),
    amount: Math.round(cleanAmount),
    category: validCategory,
    date: validDate,
    confidence: 0.95,
  }
}