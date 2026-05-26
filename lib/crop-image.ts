import type { Area } from "react-easy-crop"

export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener("load", () => resolve(image))
    image.addEventListener("error", (error) => reject(error))
    image.setAttribute("crossOrigin", "anonymous")
    image.src = url
  })

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation)
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  }
}

/** Crop image to pixel area and return a JPEG data URL (optionally scaled down). */
export async function getCroppedImageDataUrl(
  imageSrc: string,
  pixelCrop: Area,
  options?: { maxSize?: number; quality?: number; rotation?: number }
): Promise<string> {
  const maxSize = options?.maxSize ?? 512
  const quality = options?.quality ?? 0.92
  const rotation = options?.rotation ?? 0

  const image = await createImage(imageSrc)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not get canvas context")

  const rotRad = getRadianAngle(rotation)
  const { width: boxWidth, height: boxHeight } = rotateSize(image.width, image.height, rotation)

  canvas.width = boxWidth
  canvas.height = boxHeight

  ctx.translate(boxWidth / 2, boxHeight / 2)
  ctx.rotate(rotRad)
  ctx.translate(-image.width / 2, -image.height / 2)
  ctx.drawImage(image, 0, 0)

  const croppedCanvas = document.createElement("canvas")
  const croppedCtx = croppedCanvas.getContext("2d")
  if (!croppedCtx) throw new Error("Could not get canvas context")

  let outputWidth = pixelCrop.width
  let outputHeight = pixelCrop.height
  if (outputWidth > maxSize || outputHeight > maxSize) {
    const scale = maxSize / Math.max(outputWidth, outputHeight)
    outputWidth = Math.round(outputWidth * scale)
    outputHeight = Math.round(outputHeight * scale)
  }

  croppedCanvas.width = outputWidth
  croppedCanvas.height = outputHeight

  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  )

  return croppedCanvas.toDataURL("image/jpeg", quality)
}
