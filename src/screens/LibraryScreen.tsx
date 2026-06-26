import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Notebook, Pencil, Trash2 } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { NewNotebookDialog } from '@/components/NewNotebookDialog'
import { RenameDialog } from '@/components/RenameDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { paths } from '@/routes/paths'
import type { NotebookEntry } from '@/types'

interface MenuState {
  x: number
  y: number
  nb: NotebookEntry
}

//lists the notebooks in the open library
export function LibraryScreen() {
  const navigate = useNavigate()
  const library = useAppStore((s) => s.library)
  const notebooks = useAppStore((s) => s.notebooks)
  const openNotebook = useAppStore((s) => s.openNotebook)
  const closeLibrary = useAppStore((s) => s.closeLibrary)
  const renameNotebook = useAppStore((s) => s.renameNotebook)
  const deleteNotebook = useAppStore((s) => s.deleteNotebook)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [rename, setRename] = useState<NotebookEntry | null>(null)
  const [confirm, setConfirm] = useState<NotebookEntry | null>(null)

  //leave the library, clear state then return to launch
  function handleBack() {
    closeLibrary()
    navigate(paths.launch)
  }

  function handleOpen(nb: NotebookEntry) {
    openNotebook(nb)
    if (library) navigate(paths.notebook(library.name, nb.name))
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          aria-label="back to launch"
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {library?.name}
          </h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {notebooks.length} notebook{notebooks.length === 1 ? '' : 's'}
          </p>
        </div>
        <NewNotebookDialog />
      </header>

      {notebooks.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Notebook className="size-8" aria-hidden />
            <p className="text-sm">no notebooks in this library yet</p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {notebooks.map((nb) => (
            <li key={nb.name}>
              <button
                onClick={() => handleOpen(nb)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, nb })
                }}
                className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Notebook className="size-6 text-primary" aria-hidden />
                <span className="truncate text-sm font-medium">{nb.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu && (
        <NotebookMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onRename={(nb) => setRename(nb)}
          onDelete={(nb) => setConfirm(nb)}
        />
      )}

      {rename && (
        <RenameDialog
          kind="notebook"
          currentName={rename.name}
          onClose={() => setRename(null)}
          onRename={(name) => renameNotebook(rename.name, name)}
        />
      )}

      {confirm && (
        <Dialog open onOpenChange={(open) => !open && setConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete notebook</DialogTitle>
              <DialogDescription>
                Permanently delete “{confirm.name}” and all its pages? This cannot be
                undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await deleteNotebook(confirm.name)
                  setConfirm(null)
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

//floating right click menu for a notebook
function NotebookMenu({
  menu,
  onClose,
  onRename,
  onDelete,
}: {
  menu: MenuState
  onClose: () => void
  onRename: (nb: NotebookEntry) => void
  onDelete: (nb: NotebookEntry) => void
}) {
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      role="menu"
      className="fixed z-50 min-w-44 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        role="menuitem"
        onClick={() => {
          onRename(menu.nb)
          onClose()
        }}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none hover:bg-accent"
      >
        <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Rename notebook
      </button>
      <button
        role="menuitem"
        onClick={() => {
          onDelete(menu.nb)
          onClose()
        }}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-destructive outline-none hover:bg-destructive/10"
      >
        <Trash2 className="size-4 shrink-0" aria-hidden />
        Delete notebook
      </button>
    </div>
  )
}
