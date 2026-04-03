'use client'

const MAX_DIMENSION = 200
const JPEG_QUALITY = 0.7

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image for compression.'))
    image.src = src
  })
}

function getResizedDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    throw new Error('Image dimensions must be greater than zero.')
  }

  const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode image as JPEG.'))
          return
        }

        resolve(blob)
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

export async function compressImage(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(objectUrl)
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    const { width, height } = getResizedDimensions(sourceWidth, sourceHeight)
    const canvas = document.createElement('canvas')

    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Canvas 2D context is unavailable.')
    }

    context.drawImage(image, 0, 0, width, height)

    return canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
