import { useNavigate } from 'react-router-dom'
import { ChevronLeft, FileText } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/button'
import { paths } from '@/routes/paths'

//placeholder workspace, phase 2 brings sections, groups, pages and the canvas
export function NotebookScreen() {
  const navigate = useNavigate()
  const library = useAppStore((s) => s.library)
  const activeNotebook = useAppStore((s) => s.activeNotebook)
  const closeNotebook = useAppStore((s) => s.closeNotebook)

  //back to the library notebook list
  function handleBack() {
    closeNotebook()
    if (library) navigate(paths.library(library.name))
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          aria-label="back to library"
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {activeNotebook?.name}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {library?.name}
          </p>
        </div>
      </header>

      <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <FileText className="size-8" aria-hidden />
          <p className="text-sm">no pages yet</p>
        </div>
      </div>
    </div>
  )
}
