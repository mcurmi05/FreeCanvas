import type { NotebookEntry, PageNode } from '../types'
import { blankPage } from './pageDoc'

//page files are plain html for the rough prototype
export const PAGE_EXT = '.html'

//a page that holds child pages keeps its own content here, inside its folder
export const INDEX_FILE = 'index' + PAGE_EXT

//each folder remembers the order of its children here, a json array of disk names
export const ORDER_FILE = '.order'

//reserved subfolder name where a page keeps its imported images and files
//never shown in the sidebar, lives beside the page's index.html
export const ATTACHMENTS_DIR = 'attachments'

//the on disk name for a node, leaf pages carry the extension, folders do not
export function diskName(node: PageNode): string {
  return node.dirHandle ? node.name : node.name + PAGE_EXT
}

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

//get a file handle if present, null when missing
async function getFileIfExists(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemFileHandle | null> {
  try {
    return await dir.getFileHandle(name)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null
    throw err
  }
}

//read a folder's saved child order, a list of disk names, empty when unset
export async function readOrder(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const file = await getFileIfExists(dir, ORDER_FILE)
  if (!file) return []
  try {
    const arr = JSON.parse(await (await file.getFile()).text())
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

//persist a folder's child order, names not present on disk are harmless
export async function writeOrder(
  dir: FileSystemDirectoryHandle,
  names: string[],
): Promise<void> {
  const file = await dir.getFileHandle(ORDER_FILE, { create: true })
  const writable = await file.createWritable()
  await writable.write(JSON.stringify(names))
  await writable.close()
}

//read a notebook's page tree, recursing into subfolders
//directories with an index.html are pages that own children, others are groups
export async function listPageTree(
  dir: FileSystemDirectoryHandle,
  parentPath = '',
  depth = 0,
): Promise<PageNode[]> {
  const dirs: [string, FileSystemDirectoryHandle][] = []
  const files: [string, FileSystemFileHandle][] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') {
      //the attachments folder backs a page's imported files, not a child page
      if (name === ATTACHMENTS_DIR) continue
      dirs.push([name, handle])
    } else if (name.endsWith(PAGE_EXT) && name !== INDEX_FILE) {
      files.push([name, handle as FileSystemFileHandle])
    }
  }

  const nodes: PageNode[] = []
  for (const [name, handle] of dirs) {
    const path = parentPath ? `${parentPath}/${name}` : name
    const index = await getFileIfExists(handle, INDEX_FILE)
    nodes.push({
      name,
      path,
      kind: index ? 'page' : 'group',
      depth,
      fileHandle: index ?? undefined,
      dirHandle: handle,
      children: await listPageTree(handle, path, depth + 1),
    })
  }
  for (const [fileName, handle] of files) {
    const name = pageTitle(fileName)
    nodes.push({
      name,
      path: parentPath ? `${parentPath}/${name}` : name,
      kind: 'page',
      depth,
      fileHandle: handle,
      children: [],
    })
  }
  //order by the saved sequence, anything unlisted falls back to alphabetical
  const order = await readOrder(dir)
  nodes.sort((a, b) => {
    const ia = order.indexOf(diskName(a))
    const ib = order.indexOf(diskName(b))
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

//walk a slash path from the notebook root to a directory handle
//every segment is a folder, leaf pages never appear as ancestors here
export async function resolveDir(
  notebook: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle> {
  let dir = notebook
  if (!path) return dir
  for (const seg of path.split('/')) {
    dir = await dir.getDirectoryHandle(seg)
  }
  return dir
}

//promote a leaf page (Name.html) into a folder (Name/index.html) so it can
//hold children, returns the new backing folder
export async function promotePageToDir(
  notebook: FileSystemDirectoryHandle,
  node: PageNode,
): Promise<FileSystemDirectoryHandle> {
  const parentPath = node.path.split('/').slice(0, -1).join('/')
  const parent = await resolveDir(notebook, parentPath)
  const content = node.fileHandle ? await readPage(node.fileHandle) : '<p></p>'
  const dir = await parent.getDirectoryHandle(node.name, { create: true })
  const index = await dir.getFileHandle(INDEX_FILE, { create: true })
  await writePage(index, content)
  await parent.removeEntry(node.name + PAGE_EXT)
  return dir
}

//create an empty page file inside a folder, returns its handle
export async function createPage(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemFileHandle> {
  const handle = await dir.getFileHandle(name + PAGE_EXT, { create: true })
  await writePage(handle, blankPage())
  return handle
}

//create an empty group (a folder with no index.html) inside a folder
export async function createGroup(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return dir.getDirectoryHandle(name, { create: true })
}

//true when the folder already holds a page or folder with this base name
export async function entryExists(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  return (
    (await getFileIfExists(dir, name + PAGE_EXT)) !== null ||
    (await directoryExists(dir, name))
  )
}

//recursively copy a file or folder handle into a destination folder
//the file system access api has no native move, so move is copy then remove
export async function copyEntry(
  src: FileSystemHandle,
  destParent: FileSystemDirectoryHandle,
  destName: string,
): Promise<void> {
  if (src.kind === 'file') {
    const file = await (src as FileSystemFileHandle).getFile()
    const dest = await destParent.getFileHandle(destName, { create: true })
    const writable = await dest.createWritable()
    await writable.write(file)
    await writable.close()
    return
  }
  const dir = src as FileSystemDirectoryHandle
  const destDir = await destParent.getDirectoryHandle(destName, { create: true })
  for await (const [name, handle] of dir.entries()) {
    await copyEntry(handle, destDir, name)
  }
}

//first page found walking the tree depth first, null when there are none
export function firstPage(nodes: PageNode[]): PageNode | null {
  for (const node of nodes) {
    if (node.kind === 'page') return node
    const child = firstPage(node.children)
    if (child) return child
  }
  return null
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
