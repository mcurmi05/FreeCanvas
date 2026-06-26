import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Notebook } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { NewNotebookDialog } from '@/components/NewNotebookDialog'
import { Button } from '@/components/ui/button'
import { paths } from '@/routes/paths'
import type { NotebookEntry } from '@/types'

//lists the notebooks in the open library
export function LibraryScreen() {
  const navigate = useNavigate()
  const library = useAppStore((s) => s.library)
  const notebooks = useAppStore((s) => s.notebooks)
  const openNotebook = useAppStore((s) => s.openNotebook)
  const closeLibrary = useAppStore((s) => s.closeLibrary)

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
                className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Notebook className="size-6 text-primary" aria-hidden />
                <span className="truncate text-sm font-medium">{nb.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
