// Prepares a picked file for PUT /auth/avatar: the server caps uploads at
// 2 MB and a phone photo is several times that, so the browser downscales it
// first. Anything the browser can't decode (HEIC on most of them) is sent
// as-is and left to the server's size check.

export const AVATAR_MAX_SIDE = 512
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

// Fits (width, height) inside a maxSide square without upscaling.
export function fitWithin(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function decode(file: File): Promise<ImageBitmap> {
  // EXIF orientation is applied by createImageBitmap by default, so a
  // portrait phone photo comes out upright.
  return createImageBitmap(file)
}

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await decode(file)
  } catch {
    if (file.size <= AVATAR_MAX_BYTES) return file
    throw new Error("Couldn't read that image; try a JPEG or PNG under 2 MB")
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, AVATAR_MAX_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)

    // PNG keeps transparency; everything else goes to JPEG, which is far
    // smaller for a photo.
    const type = file.type === 'image/png' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, 0.9)
    )
    if (!blob) return file
    return blob
  } finally {
    bitmap.close()
  }
}
