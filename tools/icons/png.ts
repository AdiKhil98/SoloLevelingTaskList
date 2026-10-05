import { deflateSync, inflateSync } from 'node:zlib'
import type { Raster } from './render.ts'

/**
 * A minimal PNG encoder/decoder (8-bit RGBA, no interlacing) so the icons can be generated with nothing but Node.
 * The encoder picks the best of the five row filters per row (smaller files); the decoder reads all five, so a
 * test can decode the committed PNGs and compare their PIXELS with a fresh render (the compressed bytes may differ
 * between zlib versions, the pixels cannot).
 */

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
const BYTES_PER_PIXEL = 4

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 255] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function filterRow(type: number, row: Uint8Array, previous: Uint8Array | null): Uint8Array {
  const out = new Uint8Array(row.length)
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= BYTES_PER_PIXEL ? (row[i - BYTES_PER_PIXEL] as number) : 0
    const up = previous === null ? 0 : (previous[i] as number)
    const upLeft = previous === null || i < BYTES_PER_PIXEL ? 0 : (previous[i - BYTES_PER_PIXEL] as number)
    const predictor = type === 0 ? 0 : type === 1 ? left : type === 2 ? up : type === 3 ? (left + up) >> 1 : paeth(left, up, upLeft)
    out[i] = (row[i] as number) - predictor
  }
  return out
}

const signedSum = (bytes: Uint8Array) => bytes.reduce((sum, byte) => sum + (byte < 128 ? byte : 256 - byte), 0)

export function encodePng({ width, height, data }: Raster): Uint8Array {
  const stride = width * BYTES_PER_PIXEL
  const scanlines = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = data.subarray(y * stride, (y + 1) * stride)
    const previous = y === 0 ? null : data.subarray((y - 1) * stride, y * stride)
    let best = { type: 0, bytes: filterRow(0, row, previous), cost: Infinity }
    best = { ...best, cost: signedSum(best.bytes) }
    for (const type of [1, 2, 4]) {
      const bytes = filterRow(type, row, previous)
      const cost = signedSum(bytes)
      if (cost < best.cost) best = { type, bytes, cost }
    }
    scanlines[y * (stride + 1)] = best.type
    scanlines.set(best.bytes, y * (stride + 1) + 1)
  }

  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit, RGBA, deflate, adaptive filtering, no interlace

  const parts = [SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', new Uint8Array(0))]
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.length
  }
  return png
}

export function decodePng(png: Uint8Array): Raster {
  for (let i = 0; i < SIGNATURE.length; i += 1) if (png[i] !== SIGNATURE[i]) throw new Error('Not a PNG file')
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let width = 0
  let height = 0
  const compressed: Uint8Array[] = []
  for (let offset = 8; offset < png.length; ) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8))
    const body = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('Only 8-bit RGBA, non-interlaced PNGs are supported')
    } else if (type === 'IDAT') compressed.push(body)
    offset += 12 + length
  }

  const raw = inflateSync(Buffer.concat(compressed))
  const stride = width * BYTES_PER_PIXEL
  const data = new Uint8Array(stride * height)
  for (let y = 0; y < height; y += 1) {
    const type = raw[y * (stride + 1)] as number
    for (let i = 0; i < stride; i += 1) {
      const value = raw[y * (stride + 1) + 1 + i] as number
      const left = i >= BYTES_PER_PIXEL ? (data[y * stride + i - BYTES_PER_PIXEL] as number) : 0
      const up = y === 0 ? 0 : (data[(y - 1) * stride + i] as number)
      const upLeft = y === 0 || i < BYTES_PER_PIXEL ? 0 : (data[(y - 1) * stride + i - BYTES_PER_PIXEL] as number)
      const predictor = type === 0 ? 0 : type === 1 ? left : type === 2 ? up : type === 3 ? (left + up) >> 1 : paeth(left, up, upLeft)
      data[y * stride + i] = (value + predictor) & 255
    }
  }
  return { width, height, data }
}
