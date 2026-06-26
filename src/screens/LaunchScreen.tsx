import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Library, NotebookPen, X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import {
  directoryHandleFromDrop,
  isFileSystemAccessSupported,
} from '@/lib/fs'
import { getRecentLibraries } from '@/lib/recentLibraries'
import { Button } from '@/components/ui/button'
import { paths } from '@/routes/paths'
import { cn } from '@/lib/utils'
import type { LibraryRef } from '@/types'

const supported = isFileSystemAccessSupported()

export function LaunchScreen() {
  const navigate = useNavigate()
  const openLibrary = useAppStore((s) => s.openLibrary)
  const openLibraryHandle = useAppStore((s) => s.openLibraryHandle)
  const reopenLibrary = useAppStore((s) => s.reopenLibrary)
  const dropLibrary = useAppStore((s) => s.dropLibrary)
  const loading = useAppStore((s) => s.loading)
  const error = useAppStore((s) => s.error)
  const library = useAppStore((s) => s.library)

  const [recent, setRecent] = useState<LibraryRef[]>([])
  const [dragging, setDragging] = useState(false)

  //refresh the recent list whenever the picker or a removal mutates idb
  useEffect(() => {
    getRecentLibraries().then(setRecent)
  }, [library, loading])

  //open via picker then route into the library on success
  async function handleOpen() {
    const ref = await openLibrary()
    if (ref) navigate(paths.library(ref.name))
  }

  async function handleReopen(l: LibraryRef) {
    if (await reopenLibrary(l)) navigate(paths.library(l.name))
  }

  async function handleRemove(
    e: React.MouseEvent | React.KeyboardEvent,
    id: string,
  ) {
    e.stopPropagation()
    await dropLibrary(id)
    setRecent(await getRecentLibraries())
  }

  //adopt a folder dropped onto the launch screen as a library
  async function handleFolderDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (!supported) return
    const handle = await directoryHandleFromDrop(e.dataTransfer)
    if (!handle) return
    const ref = await openLibraryHandle(handle)
    if (ref) navigate(paths.library(ref.name))
  }

  return (
    <div
      className="grid min-h-full place-items-center p-6"
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragging) setDragging(true)
      }}
      onDragLeave={(e) => {
        //only clear when leaving the whole drop region
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={handleFolderDrop}
    >
      <main
        className={cn(
          'w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[0_1px_2px_rgba(20,24,40,0.04),0_12px_40px_-12px_rgba(20,24,40,0.12)] transition-[border-color,box-shadow] sm:p-10',
          dragging && 'border-primary ring-2 ring-primary/30',
        )}
      >
        {/*brand*/}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <NotebookPen className="size-7" aria-hidden />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
            Notebook
          </h1>
    
        </div>

        {!supported && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800"
          >
            this browser does not support folder access yet. use a recent
            version of chrome, edge, or another chromium browser.
          </div>
        )}

        {/*primary actions, a library is just a folder you point at*/}
        <div className="mt-7 flex flex-col gap-2.5">
          <Button size="lg" onClick={handleOpen} disabled={!supported || loading}>
            <FolderOpen aria-hidden />
            Open library folder
          </Button>
          {supported && (
            <p className="mt-1 text-center text-xs text-muted-foreground text-balance">
              Open or drop a folder to use as your library. To start fresh, make
              an empty folder and open it.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {recent.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Libraries
            </h2>
            <ul className="flex flex-col gap-1">
              {recent.map((l) => (
                <li key={l.id}>
                  <button
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    onClick={() => handleReopen(l)}
                    disabled={loading}
                  >
                    <Library
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{l.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatWhen(l.lastOpened)}
                      </span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`remove ${l.name} from recent`}
                      onClick={(e) => handleRemove(e, l.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') handleRemove(e, l.id)
                      }}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 outline-none transition-[opacity,background-color,color] hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                    >
                      <X className="size-4" aria-hidden />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}

//relative time label for the recent list
function formatWhen(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}
