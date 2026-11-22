import { config } from './config.js'
import { createApp } from './app.js'

const app = createApp()
app.listen(config.port, () => {
  console.log(`SaveSmart AI backend berjalan di http://localhost:${config.port}`)
  console.log(`OCR: ${config.ocrMode === 'service' ? config.ocrUrl : 'mode mock (hasil contoh)'}`)
})
