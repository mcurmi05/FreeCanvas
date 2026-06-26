import { create } from 'zustand'
import type { LibraryRef, NotebookEntry } from '../types'
import {
  createSubfolder,
  directoryExists,
  listNotebooks,
  pickLibraryDirectory,
  verifyPermission,
} from '../lib/fs'
import { forgetLibrary, rememberLibrary } from '../lib/recentLibraries'

interface AppState {
  library: LibraryRef | null
  notebooks: NotebookEntry[]
  activeNotebook: NotebookEntry | null
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
  //enter a notebook
  openNotebook: (notebook: NotebookEntry) => void
  //leave the open notebook, back to the library
  closeNotebook: () => void
}

//shared loader, remember the library and pull its notebooks
async function loadLibrary(
  set: (partial: Partial<AppState>) => void,
  handle: FileSystemDirectoryHandle,
): Promise<LibraryRef> {
  const ref = await rememberLibrary(handle)
  const notebooks = await listNotebooks(handle)
  set({ library: ref, notebooks, activeNotebook: null, loading: false })
  return ref
}

export const useAppStore = create<AppState>((set, get) => ({
  library: null,
  notebooks: [],
  activeNotebook: null,
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
    set({ library: null, notebooks: [], activeNotebook: null }),

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

  openNotebook: (notebook) => set({ activeNotebook: notebook }),

  closeNotebook: () => set({ activeNotebook: null }),
}))
