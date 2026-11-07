import { mkdir, copyFile, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { ZXING_WASM_SHA256 } from 'barcode-detector/ponyfill'

const require = createRequire(import.meta.url)
const source = resolve(dirname(require.resolve('zxing-wasm/reader')), '../../reader/zxing_reader.wasm')
const hash = createHash('sha256').update(await readFile(source)).digest('hex')
if (hash !== ZXING_WASM_SHA256) throw new Error('Unexpected QR decoder checksum')
await mkdir('public/qr', { recursive: true })
await copyFile(source, 'public/qr/zxing_reader.wasm')
