
import sharp from 'sharp'
import { CATEGORIES, config } from '../config.js'
import { HttpError } from '../http.js'
import { today } from '../util.js'

const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}

function extractJSON(content) {
  if (!content) return null

  const cleaned = content
    .replace(/```(?:json)?/gi, '')
    .trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')

  if (start === -1 || end <= start) return null

  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function scanReceipt({ file, simulateFail = false }) {
  if (!file) {
    throw new HttpError(
      400,
      'NO_FILE',
      'Foto struk wajib diunggah.'
    )
  }

  if (simulateFail) {
    throw new HttpError(
      422,
      'OCR_FAILED',
      'Struk tidak terbaca, coba foto ulang dengan cahaya lebih terang.'
    )
  }

  if (config.ocrMode !== 'service') {
    throw new HttpError(
      500,
      'OCR_MODE_DISABLED',
      'OCR_MODE harus diatur ke service untuk menggunakan Gemini.'
    )
  }

  const apiKey = String(config.aiApiKey || '').trim()

  if (!apiKey) {
    throw new HttpError(
      500,
      'OCR_CONFIG_ERROR',
      'GEMINI_API_KEY belum diatur di server.'
    )
  }

  // 1. Optimasi gambar
  let compressedBuffer

  try {
    compressedBuffer = await sharp(file.buffer)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer()
  } catch (err) {
    console.error('Gagal memproses gambar struk:', err.message)

    throw new HttpError(
      422,
      'IMAGE_PROCESS_ERROR',
      'Foto tidak dapat diproses. Gunakan JPG, PNG, atau WebP.'
    )
  }

  const base64Image = compressedBuffer.toString('base64')

  // 2. Instruksi OCR
  const prompt = `
Kamu adalah sistem OCR profesional untuk aplikasi keuangan Indonesia.

Baca gambar struk dengan teliti.

Ambil informasi berikut:

1. title: Nama toko atau merchant.
2. amount: TOTAL AKHIR yang harus dibayar pelanggan.
3. category: Kategori pengeluaran.
4. date: Tanggal transaksi.

Pilih kategori hanya dari daftar berikut:
${CATEGORIES.join(', ')}

ATURAN PENTING:

- Ambil TOTAL BAYAR atau GRAND TOTAL.
- Jangan mengambil subtotal jika terdapat total akhir.
- Jangan mengambil nominal kembalian sebagai total transaksi.
- Jangan mengambil nominal pajak sebagai total transaksi.
- Amount harus berupa integer Rupiah tanpa titik atau koma.
- Jangan mengarang informasi yang tidak terlihat.
- Jika tanggal tidak terbaca, isi string kosong.
- Jika gambar bukan struk atau nominal total tidak dapat dibaca, gunakan amount 0.
- Jika merchant tidak terbaca, gunakan "Transaksi Struk".
- Pilih kategori berdasarkan jenis barang atau jasa yang dibeli.
- Jangan menambahkan penjelasan di luar hasil JSON.
`

  // 3. Structured output Gemini
  const generationConfig = {
    temperature: 0,
    maxOutputTokens: 1024,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
        },
        amount: {
          type: 'INTEGER',
        },
        category: {
          type: 'STRING',
          enum: CATEGORIES,
        },
        date: {
          type: 'STRING',
        },
      },
      required: ['title', 'amount', 'category', 'date'],
    },
  }

  // 4. Urutan model
  const candidates = [
    ...new Set([
      config.aiModel,
      ...FALLBACK_MODELS,
    ].filter(Boolean)),
  ]

  let parsed = null
  let lastError = ''

  // 5. Proses pemanggilan Gemini
  for (const modelName of candidates) {
    let modelSucceeded = false

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(
          `OCR: mencoba model ${modelName}, percobaan ${attempt}/2`
        )

        const endpoint =
          `${config.ocrUrl}/${encodeURIComponent(modelName)}:generateContent`

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: 'image/jpeg',
                      data: base64Image,
                    },
                  },
                ],
              },
            ],
            generationConfig,
          }),
        })

        if (!response.ok) {
          lastError = await response.text()

          console.error(
            `Gemini ${modelName} HTTP ${response.status}:`,
            lastError.slice(0, 1000)
          )

          if (response.status === 401 || response.status === 403) {
            throw new HttpError(
              502,
              'OCR_AUTH_ERROR',
              'API Key Gemini tidak valid atau tidak memiliki akses.'
            )
          }

          if (
            (response.status === 429 || response.status === 503) &&
            attempt < 2
          ) {
            await sleep(1000 * attempt)
            continue
          }

          break
        }

        const data = await response.json()

        const candidate = data.candidates?.[0]

        if (!candidate) {
          lastError = 'Gemini tidak mengembalikan kandidat respons.'
          break
        }

        if (candidate.finishReason === 'MAX_TOKENS') {
          lastError = 'Respons Gemini terpotong karena batas token.'
          console.warn(lastError)
          break
        }

        const rawContent = (candidate.content?.parts || [])
          .map((part) => part.text || '')
          .join('')
          .trim()

        console.log(`Respons OCR diterima dari ${modelName}`)

        parsed = extractJSON(rawContent)

        if (!parsed) {
          lastError = `JSON tidak valid: ${rawContent.slice(0, 500)}`
          console.error('Gagal parse JSON Gemini:', lastError)
          break
        }

        modelSucceeded = true

        console.log(`OCR berhasil menggunakan ${modelName}`)

        break
      } catch (err) {
        if (err instanceof HttpError) throw err

        lastError = err.message

        console.warn(
          `Gemini ${modelName} gagal:`,
          lastError
        )

        if (attempt < 2) {
          await sleep(1000 * attempt)
        }
      }
    }

    if (modelSucceeded) break

    parsed = null

    console.warn(
      `Beralih ke model OCR berikutnya setelah ${modelName} gagal.`
    )
  }

  // 6. Jika seluruh model gagal
  if (!parsed) {
    console.error('Seluruh model OCR gagal:', lastError)

    throw new HttpError(
      502,
      'OCR_PROVIDER_ERROR',
      'Layanan OCR sedang bermasalah. Silakan coba beberapa saat lagi atau input transaksi secara manual.'
    )
  }
  console.log('HASIL JSON GEMINI:', parsed)
console.log('TIPE AMOUNT:', typeof parsed.amount)
console.log('NILAI AMOUNT:', parsed.amount)
console.log('KATEGORI:', parsed.category)
console.log('TANGGAL:', parsed.date)

  // 7. Validasi hasil OCR
  const amount = Number(parsed.amount)

  if (
    parsed.error === 'UNREADABLE' ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 100_000_000_000
  ) {
    throw new HttpError(
      422,
      'OCR_FAILED',
      'Total transaksi tidak berhasil dibaca. Pastikan foto struk fokus dan terang.'
    )
  }

  const title = String(
    parsed.title || 'Transaksi Struk'
  ).trim().slice(0, 100)

  const validCategory = CATEGORIES.includes(parsed.category)
    ? parsed.category
    : 'Lainnya'

  const currentDate = today()

  const validDate =
    isValidISODate(parsed.date) &&
    parsed.date <= currentDate
      ? parsed.date
      : currentDate

  // 8. Hasil akhir untuk frontend
  return {
    title,
    amount,
    category: validCategory,
    date: validDate,
    confidence: 0.9,
  }
}
