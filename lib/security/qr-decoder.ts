'use client'

import { prepareZXingModule } from 'barcode-detector/ponyfill'

// Self-host the pinned decoder: scanners never fetch executable code from a CDN.
prepareZXingModule({ overrides: { locateFile: (path, prefix) =>
  path.endsWith('.wasm') ? '/qr/zxing_reader.wasm' : prefix + path,
} })
