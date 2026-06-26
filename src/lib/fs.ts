import type { NotebookEntry, PageEntry } from '../types'

//page files are plain html for the rough prototype
export const PAGE_EXT = '.html'

//drop the page extension for display
export function pageTitle(fileName: string): string {
  return fileName.endsWith(PAGE_EXT)
    ? fileName.slice(0, -PAGE_EXT.length)
    : fileName
}

//feature detect the file system access api, chromium only for now
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

//prompt the user to point at a folder to use as the library, null if none
//selecting the folder itself (a child) is allowed, unlike picking a blocked
//root as a parent, so this path never triggers the sensitive folder message
export async function pickLibraryDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({
      id: 'library-folder',
      mode: 'readwrite',
      startIn: 'documents',
    })
  } catch {
    //any rejection (cancel, or the browser refusing a folder) is treated as
    //no selection, we never surface the browser's raw block message
    return null
  }
}

//pull the first dropped directory handle out of a drag event
//lets users drop a folder instead of fighting the native picker
export async function directoryHandleFromDrop(
  dt: DataTransfer | null,
): Promise<FileSystemDirectoryHandle | null> {
  if (!dt) return null
  //call getAsFileSystemHandle synchronously, the items list is short lived
  const pending = [...dt.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFileSystemHandle())
  const handles = await Promise.all(pending)
  for (const handle of handles) {
    if (handle?.kind === 'directory') {
      return handle as FileSystemDirectoryHandle
    }
  }
  return null
}

//characters not allowed in a folder name across common filesystems
const INVALID_NAME = /[\\/:*?"<>|]/

//validate a library or notebook name, returns an error string or null when ok
export function validateName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'enter a name'
  if (INVALID_NAME.test(trimmed)) return 'name cannot contain \\ / : * ? " < > |'
  if (trimmed === '.' || trimmed === '..') return 'pick a different name'
  return null
}

//true when the parent already holds an entry with this name
export async function directoryExists(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await parent.getDirectoryHandle(name)
    return true
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return false
    //a file with the same name also counts as a collision
    if (err instanceof DOMException && err.name === 'TypeMismatchError') return true
    throw err
  }
}

//create a subfolder under the chosen parent, used for libraries and notebooks
export async function createSubfolder(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true })
}

type PermissionState = 'granted' | 'denied' | 'prompt'

//make sure we still have permission for a stored handle
//request re-prompts the user if permission lapsed
export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  request: boolean,
): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  if (!request) return false
  const state = (await handle.requestPermission(opts)) as PermissionState
  return state === 'granted'
}

//list notebooks in a library, every subfolder is a notebook
export async function listNotebooks(
  library: FileSystemDirectoryHandle,
): Promise<NotebookEntry[]> {
  const entries: NotebookEntry[] = []
  for await (const [name, handle] of library.entries()) {
    if (handle.kind === 'directory') {
      entries.push({ name, handle })
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  return entries
}

//list pages in a notebook, every page is an html file
export async function listPages(
  notebook: FileSystemDirectoryHandle,
): Promise<PageEntry[]> {
  const entries: PageEntry[] = []
  for await (const [name, handle] of notebook.entries()) {
    if (handle.kind === 'file' && name.endsWith(PAGE_EXT)) {
      entries.push({ name, handle })
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  return entries
}

//true when the notebook already holds a file with this name
export async function fileExists(
  notebook: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await notebook.getFileHandle(name)
    return true
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return false
    throw err
  }
}

//create an empty page file inside a notebook
export async function createPage(
  notebook: FileSystemDirectoryHandle,
  name: string,
): Promise<PageEntry> {
  const fileName = name.endsWith(PAGE_EXT) ? name : name + PAGE_EXT
  const handle = await notebook.getFileHandle(fileName, { create: true })
  await writePage(handle, '<p></p>')
  return { name: fileName, handle }
}

//read a page file as html
export async function readPage(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

//write html back to a page file
export async function writePage(
  handle: FileSystemFileHandle,
  html: string,
): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(html)
  await writable.close()
}
