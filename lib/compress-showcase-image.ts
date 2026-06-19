/** Stay under backend Zod limit (1_500_000) with headroom for data-URL overhead. */
export const SHOWCASE_IMAGE_MAX_CHARS = 1_400_000

const MAX_FILE_BYTES = 5 * 1024 * 1024

export async function compressImageFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File must be under ${MAX_FILE_BYTES / (1024 * 1024)} MB`)
  }
  if (file.type === "image/gif") {
    const dataUrl = await readFileAsDataUrl(file)
    if (dataUrl.length > SHOWCASE_IMAGE_MAX_CHARS) {
      throw new Error("GIF is too large after encoding")
    }
    return dataUrl
  }
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    return compressLoadedImage(img)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Re-compress an existing data URL (e.g. loaded from API) so saves pass validation. */
export async function compressShowcaseDataUrl(dataUrl: string): Promise<string> {
  const trimmed = dataUrl.trim()
  if (!trimmed) throw new Error("Empty image")
  if (trimmed.length <= SHOWCASE_IMAGE_MAX_CHARS && trimmed.startsWith("https://")) {
    return trimmed
  }
  if (trimmed.length <= SHOWCASE_IMAGE_MAX_CHARS && !trimmed.startsWith("data:")) {
    return trimmed
  }
  if (trimmed.length <= SHOWCASE_IMAGE_MAX_CHARS && /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(trimmed)) {
    return trimmed
  }
  const img = await loadImage(trimmed)
  return compressLoadedImage(img)
}

export async function prepareShowcaseImagesForSave(images: string[]): Promise<string[]> {
  const out: string[] = []
  for (const src of images) {
    out.push(await compressShowcaseDataUrl(src))
  }
  return out
}

async function compressLoadedImage(img: HTMLImageElement): Promise<string> {
  let maxDim = 1280
  let quality = 0.82

  for (let attempt = 0; attempt < 14; attempt++) {
    const dataUrl = renderJpeg(img, maxDim, quality)
    if (dataUrl.length <= SHOWCASE_IMAGE_MAX_CHARS) {
      return dataUrl
    }
    if (quality > 0.5) {
      quality -= 0.08
    } else {
      maxDim = Math.max(480, Math.round(maxDim * 0.75))
      quality = 0.72
    }
  }

  throw new Error("Image is too large even after compression")
}

function renderJpeg(img: HTMLImageElement, maxDim: number, quality: number): string {
  let { width, height } = img
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width)
      width = maxDim
    } else {
      width = Math.round((width * maxDim) / height)
      height = maxDim
    }
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Could not compress image")
  }
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL("image/jpeg", quality)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not load image"))
    img.src = src
  })
}
