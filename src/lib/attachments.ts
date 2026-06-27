import { ATTACHMENTS_DIR } from './fs'

//characters not safe in a filename across common filesystems, replaced with -
const UNSAFE = /[\\/:*?"<>|]+/g

//strip path-unsafe characters and trim, keeping the extension readable. blank
//names fall back to 'file' so we always have something to store
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(UNSAFE, '-').replace(/\s+/g, ' ').trim()
  return cleaned || 'file'
}

//resolve a page's attachments/ folder, creating it on demand for writes
export async function getAttachmentsDir(
  pageDir: FileSystemDirectoryHandle,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  return pageDir.getDirectoryHandle(ATTACHMENTS_DIR, { create })
}

//write a blob into the page's attachments folder under a collision-safe name
//(timestamp prefix + sanitized original), returns the stored filename
export async function writeAttachment(
  pageDir: FileSystemDirectoryHandle,
  data: Blob,
  originalName: string,
): Promise<string> {
  const dir = await getAttachmentsDir(pageDir, true)
  const stored = `${Date.now()}-${sanitizeFilename(originalName)}`
  const handle = await dir.getFileHandle(stored, { create: true })
  const writable = await handle.createWritable()
  await writable.write(data)
  await writable.close()
  return stored
}

//resolve a stored attachment to an object url for display or download. returns
//null when the file is missing so callers can render a broken-state widget
export async function attachmentUrl(
  pageDir: FileSystemDirectoryHandle,
  filename: string,
): Promise<string | null> {
  try {
    const dir = await getAttachmentsDir(pageDir)
    const handle = await dir.getFileHandle(filename)
    const file = await handle.getFile()
    return URL.createObjectURL(file)
  } catch {
    return null
  }
}
