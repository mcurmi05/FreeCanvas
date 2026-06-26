import { useNavigate } from 'react-router-dom'
import { ChevronLeft, FileText } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { pageTitle } from '@/lib/fs'
import { PageEditor } from '@/components/PageEditor'
import { NewPageDialog } from '@/components/NewPageDialog'
import { Button } from '@/components/ui/button'
import { paths } from '@/routes/paths'
import { cn } from '@/lib/utils'
import type { PageEntry } from '@/types'

//notebook workspace, pages sidebar plus the word style page editor
export function NotebookScreen() {
  const navigate = useNavigate()
  const library = useAppStore((s) => s.library)
  const activeNotebook = useAppStore((s) => s.activeNotebook)
  const pages = useAppStore((s) => s.pages)
  const activePage = useAppStore((s) => s.activePage)
  const pageContent = useAppStore((s) => s.pageContent)
  const saveState = useAppStore((s) => s.saveState)
  const openPage = useAppStore((s) => s.openPage)
  const savePage = useAppStore((s) => s.savePage)
  const closeNotebook = useAppStore((s) => s.closeNotebook)

  function handleBack() {
    closeNotebook()
    if (library) navigate(paths.library(library.name))
  }

  function isActive(p: PageEntry) {
    return activePage?.name === p.name
  }

  return (
    <div className="flex h-dvh flex-col">
      {/*header*/}
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          aria-label="back to library"
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            {activeNotebook?.name}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{library?.name}</p>
        </div>
        <span
          className="ml-auto text-xs text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {saveState === 'saving' ? 'saving…' : saveState === 'saved' ? 'saved' : ''}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/*pages sidebar*/}
        <aside className="flex shrink-0 flex-col gap-2 border-b border-border p-3 md:w-60 md:border-b-0 md:border-r">
          <NewPageDialog />
          {pages.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              no pages yet
            </p>
          ) : (
            <ul className="flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              {pages.map((p) => (
                <li key={p.name} className="shrink-0">
                  <button
                    onClick={() => openPage(p)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                      isActive(p) && 'bg-accent font-medium',
                    )}
                  >
                    <FileText
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="truncate">{pageTitle(p.name)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/*editor area*/}
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          {activePage ? (
            <PageEditor
              key={activePage.name}
              content={pageContent}
              onSave={savePage}
            />
          ) : (
            <div className="grid h-full place-items-center p-10 text-center">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <FileText className="size-8" aria-hidden />
                <p className="text-sm">
                  {pages.length === 0
                    ? 'create a page to start writing'
                    : 'select a page'}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
