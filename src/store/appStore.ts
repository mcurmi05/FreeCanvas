import { create } from 'zustand'
import type { LibraryRef, NotebookEntry, PageKind, PageNode } from '../types'
import {
  copyEntry,
  createGroup,
  createPage,
  createSubfolder,
  directoryExists,
  diskName,
  entryExists,
  firstPage,
  listNotebooks,
  listPageTree,
  PAGE_EXT,
  pickLibraryDirectory,
  promotePageToDir,
  readPage,
  resolveDir,
  verifyPermission,
  writeOrder,
  writePage,
} from '../lib/fs'

//where a dropped node lands relative to the target
export type DropPosition = 'inside' | 'before' | 'after'
import { forgetLibrary, rememberLibrary } from '../lib/recentLibraries'

type SaveState = 'idle' | 'saving' | 'saved'

interface AppState {
  library: LibraryRef | null
  notebooks: NotebookEntry[]
  activeNotebook: NotebookEntry | null
  pageTree: PageNode[]
  activePage: PageNode | null
  pageContent: string
  saveState: SaveState
  loading: boolean
  error: string | null

  //pick an existing library folder via the os picker
  openLibrary: () => Promise<LibraryRef | null>
  //adopt a library from a dropped folder handle
  openLibraryHandle: (handle: FileSystemDirectoryHandle) => Promise<LibraryRef | null>
  //reopen a remembered library, re-prompting for permission if needed
  reopenLibrary: (library: LibraryRef) => Promise<boolean>
  //drop a remembered library from the recent list
  dropLibrary: (id: string) => Promise<void>
  //clear the active library, used when returning to launch
  closeLibrary: () => void

  //create a notebook subfolder inside the open library
  createNotebook: (name: string) => Promise<boolean>
  //rename a notebook folder inside the open library
  renameNotebook: (oldName: string, newName: string) => Promise<boolean>
  //delete a notebook folder and everything inside it
  deleteNotebook: (name: string) => Promise<boolean>
  //enter a notebook and load its pages
  openNotebook: (notebook: NotebookEntry) => Promise<void>
  //leave the open notebook, back to the library
  closeNotebook: () => void

  //create a page in the open notebook and open it, parentPath nests it
  createNotebookPage: (name: string, parentPath?: string) => Promise<boolean>
  //create a group (a container folder) in the open notebook, parentPath nests it
  createNotebookGroup: (name: string, parentPath?: string) => Promise<boolean>
  //move a node relative to a target, null target drops it at the notebook root
  //inside nests it, before/after place it among the target's siblings
  moveNode: (
    sourcePath: string,
    targetPath: string | null,
    position: DropPosition,
  ) => Promise<boolean>
  //nest a node under the sibling directly above it
  makeSubpage: (path: string) => Promise<boolean>
  //move a node out to its grandparent level
  promotePage: (path: string) => Promise<boolean>
  //delete a page or group and everything inside it
  deleteNode: (path: string) => Promise<boolean>
  //rename a page or group, keeping it in place
  renameNode: (path: string, newName: string) => Promise<boolean>
  //open a page and load its html
  openPage: (page: PageNode) => Promise<void>
  //persist a page's html. pass the page the html belongs to so a debounced save
  //that lands after a page switch writes the right file, not whatever is active
  //now. defaults to the active page for direct callers
  savePage: (html: string, page?: PageNode) => Promise<void>
  //ensure the active page is backed by a folder so it can hold attachments,
  //promoting a leaf page on first import. returns the backing folder or null
  promoteActivePageToFolder: () => Promise<FileSystemDirectoryHandle | null>
}

//find a node anywhere in the tree by its path
function findNode(nodes: PageNode[], path: string): PageNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    const hit = findNode(node.children, path)
    if (hit) return hit
  }
  return null
}

//the parent path, '' when the node is at the notebook root
function parentOf(path: string): string {
  return path.split('/').slice(0, -1).join('/')
}

//the sibling list a node lives in, plus the node's index within it
function siblingsOf(tree: PageNode[], path: string): { list: PageNode[]; index: number } {
  const pp = parentOf(path)
  const list = pp ? (findNode(tree, pp)?.children ?? []) : tree
  return { list, index: list.findIndex((n) => n.path === path) }
}

//the direct children of a parent path, or the roots when the path is empty
function childrenOf(tree: PageNode[], parentPath: string): PageNode[] {
  return parentPath ? (findNode(tree, parentPath)?.children ?? []) : tree
}

//rebuild a path after its prefix was moved, used to follow the open page
function remapPath(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix
  if (path.startsWith(oldPrefix + '/')) return newPrefix + path.slice(oldPrefix.length)
  return path
}

//shared loader, remember the library and pull its notebooks
async function loadLibrary(
  set: (partial: Partial<AppState>) => void,
  handle: FileSystemDirectoryHandle,
): Promise<LibraryRef> {
  const ref = await rememberLibrary(handle)
  const notebooks = await listNotebooks(handle)
  set({
    library: ref,
    notebooks,
    activeNotebook: null,
    pageTree: [],
    activePage: null,
    pageContent: '',
    loading: false,
  })
  return ref
}

export const useAppStore = create<AppState>((set, get) => ({
  library: null,
  notebooks: [],
  activeNotebook: null,
  pageTree: [],
  activePage: null,
  pageContent: '',
  saveState: 'idle',
  loading: false,
  error: null,

  openLibrary: async () => {
    set({ error: null })
    const handle = await pickLibraryDirectory()
    if (!handle) return null //user cancelled
    set({ loading: true })
    try {
      return await loadLibrary(set, handle)
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
      return null
    }
  },

  openLibraryHandle: async (handle) => {
    set({ loading: true, error: null })
    try {
      const ok = await verifyPermission(handle, true)
      if (!ok) {
        set({ loading: false, error: 'permission to that folder was denied' })
        return null
      }
      return await loadLibrary(set, handle)
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
      return null
    }
  },

  reopenLibrary: async (library) => {
    set({ loading: true, error: null })
    try {
      const ok = await verifyPermission(library.handle, true)
      if (!ok) {
        set({ loading: false, error: 'permission to that folder was denied' })
        return false
      }
      await loadLibrary(set, library.handle)
      return true
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
      return false
    }
  },

  dropLibrary: async (id) => {
    await forgetLibrary(id)
    //touch state so the launch screen re-reads the recent list
    if (get().library?.id === id) set({ library: null })
  },

  closeLibrary: () =>
    set({
      library: null,
      notebooks: [],
      activeNotebook: null,
      pageTree: [],
      activePage: null,
      pageContent: '',
    }),

  createNotebook: async (name) => {
    const library = get().library
    if (!library) return false
    set({ loading: true, error: null })
    try {
      const folder = name.trim()
      if (await directoryExists(library.handle, folder)) {
        set({ loading: false, error: 'a notebook with that name already exists' })
        return false
      }
      await createSubfolder(library.handle, folder)
      const notebooks = await listNotebooks(library.handle)
      set({ notebooks, loading: false })
      return true
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
      return false
    }
  },

  renameNotebook: async (oldName, newName) => {
    const library = get().library
    if (!library) return false
    const name = newName.trim()
    if (name === oldName) return true
    set({ loading: true, error: null })
    try {
      if (await directoryExists(library.handle, name)) {
        set({ loading: false, error: 'a notebook with that name already exists' })
        return false
      }
      //no native rename, copy the folder to the new name then drop the old one
      const src = await library.handle.getDirectoryHandle(oldName)
      await copyEntry(src, library.handle, name)
      await library.handle.removeEntry(oldName, { recursive: true })
      const notebooks = await listNotebooks(library.handle)
      //keep the open notebook pointing at the renamed folder
      const active = get().activeNotebook
      const renamed = active?.name === oldName ? notebooks.find((n) => n.name === name) : active
      set({ notebooks, activeNotebook: renamed ?? active, loading: false })
      return true
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
      return false
    }
  },

  deleteNotebook: async (name) => {
    const library = get().library
    if (!library) return false
    set({ loading: true, error: null })
    try {
      await library.handle.removeEntry(name, { recursive: true })
      const notebooks = await listNotebooks(library.handle)
      //if the deleted notebook was open, leave it
      const closing = get().activeNotebook?.name === name
      set({
        notebooks,
        loading: false,
        ...(closing
          ? { activeNotebook: null, pageTree: [], activePage: null, pageContent: '' }
          : {}),
      })
      return true
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
      return false
    }
  },

  openNotebook: async (notebook) => {
    //set active first so route guards pass immediately
    set({ activeNotebook: notebook, pageTree: [], activePage: null, pageContent: '' })
    try {
      const pageTree = await listPageTree(notebook.handle)
      set({ pageTree })
      //land on the first page so the notebook opens with content, not a blank
      const first = firstPage(pageTree)
      if (first) await get().openPage(first)
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  closeNotebook: () =>
    set({ activeNotebook: null, pageTree: [], activePage: null, pageContent: '' }),

  createNotebookPage: async (name, parentPath) => {
    const ok = await createEntry(set, get, 'page', name, parentPath)
    return ok
  },

  createNotebookGroup: async (name, parentPath) => {
    return createEntry(set, get, 'group', name, parentPath)
  },

  moveNode: async (sourcePath, targetPath, position) => {
    const notebook = get().activeNotebook
    if (!notebook) return false

    const tree = get().pageTree
    const source = findNode(tree, sourcePath)
    if (!source) return false

    //the destination parent depends on whether we nest or reorder
    const target = targetPath !== null ? findNode(tree, targetPath) : null
    if (targetPath !== null && !target) return false
    const destParentPath =
      position === 'inside' ? (targetPath ?? '') : parentOf(targetPath as string)

    //reject drops onto self, into a descendant, or that would create a cycle
    if (position === 'inside' && targetPath === sourcePath) return false
    if (destParentPath === sourcePath) return false
    if (destParentPath.startsWith(sourcePath + '/')) return false
    if (position !== 'inside' && targetPath === sourcePath) return false

    const srcParentPath = parentOf(sourcePath)
    const sameParent = srcParentPath === destParentPath
    const srcDisk = diskName(source)

    set({ loading: true, error: null })
    try {
      //resolve the destination folder, promoting a leaf page when nesting into it
      let destDir = notebook.handle
      if (position === 'inside' && target) {
        destDir = target.dirHandle ?? (await promotePageToDir(notebook.handle, target))
      } else if (destParentPath) {
        destDir = await resolveDir(notebook.handle, destParentPath)
      }

      //physically move across folders when the parent changes
      if (!sameParent) {
        if (await entryExists(destDir, source.name)) {
          set({ loading: false, error: 'an entry with that name already exists there' })
          return false
        }
        const srcHandle = source.dirHandle ?? source.fileHandle
        if (!srcHandle) {
          set({ loading: false })
          return false
        }
        const srcDir = await resolveDir(notebook.handle, srcParentPath)
        await copyEntry(srcHandle, destDir, srcDisk)
        await srcDir.removeEntry(srcDisk, { recursive: true })
        //drop the moved name from the old folder's order
        const remaining = childrenOf(tree, srcParentPath)
          .map(diskName)
          .filter((n) => n !== srcDisk)
        await writeOrder(srcDir, remaining)
      }

      //build the destination order with the source placed at the right spot
      const destNames = childrenOf(tree, destParentPath)
        .map(diskName)
        .filter((n) => n !== srcDisk)
      let index = destNames.length
      if (position !== 'inside' && target) {
        const ti = destNames.indexOf(diskName(target))
        index = position === 'before' ? ti : ti + 1
      }
      destNames.splice(index, 0, srcDisk)
      await writeOrder(destDir, destNames)

      //reload and follow the open page to its new location
      const pageTree = await listPageTree(notebook.handle)
      const newPrefix = destParentPath ? `${destParentPath}/${source.name}` : source.name
      const active = get().activePage
      const refreshed = active
        ? findNode(pageTree, remapPath(active.path, sourcePath, newPrefix))
        : null
      set({ pageTree, activePage: refreshed ?? active, loading: false })
      return true
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
      return false
    }
  },

  makeSubpage: async (path) => {
    const { list, index } = siblingsOf(get().pageTree, path)
    const prev = list[index - 1]
    if (!prev) {
      set({ error: 'no page above to nest under' })
      return false
    }
    return get().moveNode(path, prev.path, 'inside')
  },

  promotePage: async (path) => {
    const pp = parentOf(path)
    if (!pp) {
      set({ error: 'already at the top level' })
      return false
    }
    return get().moveNode(path, parentOf(pp) || null, 'inside')
  },

  deleteNode: async (path) => {
    const notebook = get().activeNotebook
    if (!notebook) return false
    const tree = get().pageTree
    const node = findNode(tree, path)
    if (!node) return false

    set({ loading: true, error: null })
    try {
      const parentPath = parentOf(path)
      const dir = await resolveDir(notebook.handle, parentPath)
      const dn = diskName(node)
      await dir.removeEntry(dn, { recursive: true })
      //drop it from the parent's saved order
      const remaining = childrenOf(tree, parentPath)
        .map(diskName)
        .filter((n) => n !== dn)
      await writeOrder(dir, remaining)

      const pageTree = await listPageTree(notebook.handle)
      const active = get().activePage
      //if the open page lived under what we deleted, fall back to the first page
      const activeGone =
        !!active && (active.path === path || active.path.startsWith(path + '/'))
      if (activeGone) {
        set({ pageTree, loading: false })
        const first = firstPage(pageTree)
        if (first) await get().openPage(first)
        else set({ activePage: null, pageContent: '' })
      } else {
        const refreshed = active ? findNode(pageTree, active.path) : null
        set({ pageTree, activePage: refreshed ?? active, loading: false })
      }
      return true
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
      return false
    }
  },

  renameNode: async (path, newName) => {
    const notebook = get().activeNotebook
    if (!notebook) return false
    const tree = get().pageTree
    const node = findNode(tree, path)
    if (!node) return false
    const name = newName.trim()
    if (name === node.name) return true

    set({ loading: true, error: null })
    try {
      const parentPath = parentOf(path)
      const dir = await resolveDir(notebook.handle, parentPath)
      if (await entryExists(dir, name)) {
        set({ loading: false, error: 'an entry with that name already exists' })
        return false
      }

      //no native rename, copy to the new disk name then remove the old one
      const oldDisk = diskName(node)
      const newDisk = node.dirHandle ? name : name + PAGE_EXT
      const srcHandle = node.dirHandle ?? node.fileHandle
      if (!srcHandle) {
        set({ loading: false })
        return false
      }
      await copyEntry(srcHandle, dir, newDisk)
      await dir.removeEntry(oldDisk, { recursive: true })
      //swap the name in the parent's saved order, keeping its position
      const order = childrenOf(tree, parentPath).map((n) =>
        n.path === path ? newDisk : diskName(n),
      )
      await writeOrder(dir, order)

      const pageTree = await listPageTree(notebook.handle)
      const newPath = parentPath ? `${parentPath}/${name}` : name
      const active = get().activePage
      const refreshed = active
        ? findNode(pageTree, remapPath(active.path, path, newPath))
        : null
      set({ pageTree, activePage: refreshed ?? active, loading: false })
      return true
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
      return false
    }
  },

  openPage: async (page) => {
    //read the file before activating so the editor mounts with real content,
    //the library only takes the content prop once at mount, not on updates
    if (!page.fileHandle) {
      set({ activePage: page, pageContent: '', saveState: 'idle' })
      return
    }
    try {
      const html = await readPage(page.fileHandle)
      set({ activePage: page, pageContent: html, saveState: 'idle' })
    } catch (err) {
      set({ activePage: page, pageContent: '', error: (err as Error).message })
    }
  },

  savePage: async (html, page = get().activePage ?? undefined) => {
    if (!page?.fileHandle) return
    //never resurrect a page that's been deleted or renamed away: a debounced or
    //unmount-flush save can fire after the node is gone from the tree, and
    //writing its handle would recreate the file on disk
    if (!findNode(get().pageTree, page.path)) return
    //only touch shared ui state (content echo, save badge) while this page is
    //still the active one. a save flushed after a switch must write its own file
    //but must not stomp the now-visible page's content or save indicator
    const stillActive = () => get().activePage?.path === page.path
    if (stillActive()) set({ saveState: 'saving' })
    try {
      await writePage(page.fileHandle, html)
      if (stillActive()) set({ pageContent: html, saveState: 'saved' })
    } catch (err) {
      if (stillActive()) set({ saveState: 'idle', error: (err as Error).message })
    }
  },

  promoteActivePageToFolder: async () => {
    const notebook = get().activeNotebook
    const page = get().activePage
    if (!notebook || !page) return null
    //already a folder, hand back its backing directory unchanged
    if (page.dirHandle) return page.dirHandle
    try {
      const dir = await promotePageToDir(notebook.handle, page)
      //reload the tree and re-point the active page at its promoted node so it
      //now carries a dirHandle, the sidebar simply gains an expand affordance
      const pageTree = await listPageTree(notebook.handle)
      const refreshed = findNode(pageTree, page.path)
      set({ pageTree, activePage: refreshed ?? page })
      return dir
    } catch (err) {
      set({ error: (err as Error).message })
      return null
    }
  },
}))

//create a page or group, nesting under parentPath when given
//a leaf page parent is first promoted to a folder so it can hold children
async function createEntry(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  kind: PageKind,
  name: string,
  parentPath?: string,
): Promise<boolean> {
  const notebook = get().activeNotebook
  if (!notebook) return false
  set({ loading: true, error: null })
  try {
    const base = name.trim()

    //resolve the folder the new entry lands in
    let parentDir = notebook.handle
    if (parentPath) {
      const parent = findNode(get().pageTree, parentPath)
      if (!parent) {
        set({ loading: false, error: 'parent no longer exists' })
        return false
      }
      parentDir = parent.dirHandle ?? (await promotePageToDir(notebook.handle, parent))
    }

    if (await entryExists(parentDir, base)) {
      set({ loading: false, error: `a ${kind} with that name already exists` })
      return false
    }

    let created: PageNode | null = null
    if (kind === 'page') {
      await createPage(parentDir, base)
    } else {
      await createGroup(parentDir, base)
    }

    //reload the tree, then open the new page (groups have no content to open)
    const pageTree = await listPageTree(notebook.handle)
    const newPath = parentPath ? `${parentPath}/${base}` : base
    created = findNode(pageTree, newPath)
    set({ pageTree, loading: false })
    if (kind === 'page' && created) {
      await get().openPage(created)
    } else {
      //the open page may have been promoted to a folder, refresh its handle
      const active = get().activePage
      const refreshed = active && findNode(pageTree, active.path)
      if (refreshed) set({ activePage: refreshed })
    }
    return true
  } catch (err) {
    set({ loading: false, error: (err as Error).message })
    return false
  }
}
