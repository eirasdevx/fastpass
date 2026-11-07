import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co'
const { coverPath, removeCovers } = await import('@/lib/covers')

const id = '0f8b5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const url = `https://abc.supabase.co/storage/v1/object/public/event-covers/${id}/${id}.webp`

describe('portadas subidas', () => {
  it('solo reconoce imágenes de su propio bucket', () => {
    expect(coverPath(url)).toBe(`${id}/${id}.webp`)
    expect(coverPath('https://otra.web/foto.jpg')).toBeNull()
    expect(coverPath(`https://abc.supabase.co/storage/v1/object/public/event-covers/${id}/../x.webp`)).toBeNull()
    expect(coverPath(null)).toBeNull()
  })
  const remove = vi.fn()
  const db = { storage: { from: () => ({ remove }) } } as never
  beforeEach(() => { remove.mockReset() })
  it('borra las propias, sin repetir, y nunca falla aunque el almacenamiento falle', async () => {
    await removeCovers(db, [url, url, 'https://otra.web/foto.jpg', null])
    expect(remove).toHaveBeenCalledWith([`${id}/${id}.webp`])
    remove.mockRejectedValue(new Error('caído'))
    await expect(removeCovers(db, [url])).resolves.toBeUndefined()
  })
  it('no llama al almacenamiento si no hay nada suyo', async () => {
    await removeCovers(db, ['https://otra.web/foto.jpg'])
    expect(remove).not.toHaveBeenCalled()
  })
})
