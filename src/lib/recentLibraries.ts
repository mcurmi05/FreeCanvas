import { get, set } from 'idb-keyval'
import type { LibraryRef } from '../types'

//FileSystemDirectoryHandle is structured-cloneable so idb can persist it
//across sessions, that is how we reopen a library without re-picking

const KEY = 'recent-libraries'
const MAX_RECENT = 8

//stored shape, handle plus a bit of metadata
interface StoredLibrary {
  id: string
  name: string
  handle: FileSystemDirectoryHandle
  lastOpened: number
}

export async function getRecentLibraries(): Promise<LibraryRef[]> {
  const list = (await get<StoredLibrary[]>(KEY)) ?? []
  return list.sort((a, b) => b.lastOpened - a.lastOpened)
}

//add or bump a library to the top of the recent list
export async function rememberLibrary(
  handle: FileSystemDirectoryHandle,
): Promise<LibraryRef> {
  const list = (await get<StoredLibrary[]>(KEY)) ?? []

  //dedupe by comparing handles, isSameEntry is the only reliable check
  let existing: StoredLibrary | undefined
  for (const l of list) {
    if (await l.handle.isSameEntry(handle)) {
      existing = l
      break
    }
  }

  const ref: StoredLibrary = existing ?? {
    id: crypto.randomUUID(),
    name: handle.name,
    handle,
    lastOpened: 0,
  }
  ref.lastOpened = Date.now()
  ref.name = handle.name

  const next = [ref, ...list.filter((l) => l.id !== ref.id)].slice(0, MAX_RECENT)
  await set(KEY, next)
  return ref
}

export async function forgetLibrary(id: string): Promise<void> {
  const list = (await get<StoredLibrary[]>(KEY)) ?? []
  await set(
    KEY,
    list.filter((l) => l.id !== id),
  )
}
