import { writeAttachment } from './attachments'
import { rid, type BoxMeta } from './pageDoc'

//true for any image file, drives the silent image-box path vs the prompt
export function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

//measure a blob's natural width/height ratio by loading it as an image, used to
//keep image boxes aspect-locked. falls back to 1 when it cannot be read
export function imageAspect(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(1)
    }
    img.src = url
  })
}

//write an image into the page's attachments folder and build its canvas box
export async function importImage(
  pageDir: FileSystemDirectoryHandle,
  file: File,
  x: number,
  y: number,
): Promise<BoxMeta> {
  const aspect = await imageAspect(file)
  const stored = await writeAttachment(pageDir, file, file.name)
  return {
    id: rid(),
    x,
    y,
    kind: 'image',
    file: stored,
    mime: file.type,
    name: file.name,
    aspect,
  }
}
