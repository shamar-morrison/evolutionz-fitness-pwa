import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImage } from '@/lib/compress-image'

describe('compressImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('resizes the image to fit within 200x200 and encodes it as jpeg', async () => {
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage,
      })),
      toBlob: vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
        callback(new Blob(['compressed'], { type: type ?? 'image/jpeg' }))
        expect(type).toBe('image/jpeg')
        expect(quality).toBe(0.7)
      }),
    } as unknown as HTMLCanvasElement

    vi.stubGlobal(
      'document',
      {
        createElement: vi.fn((tagName: string) => {
          expect(tagName).toBe('canvas')
          return canvas
        }),
      } as unknown as Document,
    )

    const createObjectURL = vi.fn(() => 'blob:photo')
    const revokeObjectURL = vi.fn()

    vi.stubGlobal(
      'URL',
      {
        createObjectURL,
        revokeObjectURL,
      } as unknown as typeof URL,
    )

    class MockImage {
      onload: (() => void) | null = null
      onerror: ((error?: unknown) => void) | null = null
      naturalWidth = 400
      naturalHeight = 300
      width = 400
      height = 300

      set src(_value: string) {
        this.onload?.()
      }
    }

    vi.stubGlobal('Image', MockImage as unknown as typeof Image)

    const blob = await compressImage(new File(['raw'], 'photo.png', { type: 'image/png' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(canvas.width).toBe(200)
    expect(canvas.height).toBe(150)
    expect(drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 200, 150)
    expect(blob.type).toBe('image/jpeg')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo')
  })
})
