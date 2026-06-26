import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { validateName } from '@/lib/fs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

//create a page in the open notebook, name only
export function NewPageDialog() {
  const createNotebookPage = useAppStore((s) => s.createNotebookPage)
  const loading = useAppStore((s) => s.loading)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveName = name.trim() || 'Untitled Page'
  const nameError = touched ? validateName(effectiveName) : null
  const canCreate = !validateName(effectiveName) && !loading

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      setTouched(false)
      setError(null)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (validateName(effectiveName)) return
    const ok = await createNotebookPage(effectiveName)
    if (ok) onOpenChange(false)
    else setError(useAppStore.getState().error)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full">
          <Plus aria-hidden />
          New page
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New page</DialogTitle>
          <DialogDescription>Adds a page to this notebook.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="page-name">Name</Label>
            <Input
              id="page-name"
              name="page-name"
              autoComplete="off"
              spellCheck={false}
              placeholder="Untitled Page"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'page-name-error' : undefined}
            />
            {nameError && (
              <p id="page-name-error" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={!canCreate}>
              Create page
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
