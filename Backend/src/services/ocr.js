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

const FREE_VISION_MODELS = [
  'qwen/qwen2.5-vl-72b-instruct:free',
  'qwen/qwen2.5-vl-32b-instruct:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'google/gemma-3-27b-it:free',
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
    throw new HttpError(500, 'OCR_CONFIG_ERROR', 'OPENROUTER_API_KEY belum diatur di server.')
  }

  // Perkecil resolusi foto struk (maks lebar 1024px) agar payload ringan & tidak diputus Cloudflare/OpenRouter
  const compressedBuffer = await sharp(file.buffer)
    .rotate()
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()

  const base64Image = compressedBuffer.toString('base64')
  const dataUrl = `data:image/jpeg;base64,${base64Image}`

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

  const candidates = [...new Set([config.aiModel, ...FREE_VISION_MODELS])].filter(Boolean)

  let data = null
  let lastError = ''

  for (const modelName of candidates) {
    try {
      const response = await fetch(config.ocrUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'SaveSmart AI',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          max_tokens: 300,
          temperature: 0.1,
        }),
      })

      if (response.ok) {
        data = await response.json()
        console.log(`OCR OpenRouter berhasil diproses dengan model: ${modelName}`)
        break
      }

      lastError = await response.text()
      console.warn(`Model OpenRouter ${modelName} dilewati (${response.status}):`, lastError)

      // Jika API key salah (401), langsung hentikan loop tanpa mencoba model berikutnya
      if (response.status === 401) {
        throw new HttpError(502, 'OCR_AUTH_ERROR', 'API Key OpenRouter tidak valid (User not found). Periksa OPENROUTER_API_KEY di .env.')
      }
    } catch (err) {
      if (err instanceof HttpError) throw err
      lastError = err.message
      console.warn(`Koneksi ke model ${modelName} terputus:`, err.message)
    }
  }

  if (!data) {
    console.error('Semua model Vision gratis OpenRouter gagal:', lastError)
    throw new HttpError(502, 'OCR_PROVIDER_ERROR', 'Layanan AI pemindai struk sedang sibuk atau tidak tersedia.')
  }

  const rawContent = data.choices?.[0]?.message?.content?.trim() || ''
  const cleanJson = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleanJson)
  } catch {
    console.error('Gagal parse JSON dari OpenRouter:', rawContent)
    throw new HttpError(422, 'OCR_PARSE_ERROR', 'Hasil pembacaan AI tidak valid, silakan input manual.')
  }

  if (parsed.error === 'UNREADABLE' || !parsed.amount || Number(parsed.amount) <= 0) {
    throw new HttpError(422, 'OCR_FAILED', 'Struk tidak terbaca dengan jelas, pastikan foto fokus dan terang.')
  }

  const validCategory = CATEGORIES.includes(parsed.category) ? parsed.category : 'Lainnya'
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) && parsed.date <= today() ? parsed.date : today()

  return {
    title: String(parsed.title || 'Transaksi Struk').slice(0, 100),
    amount: Math.round(Number(parsed.amount)),
    category: validCategory,
    date: validDate,
    confidence: 0.92,
  }
}