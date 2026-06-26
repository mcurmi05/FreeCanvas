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

//create a notebook inside the open library, just needs a name
//the library handle is already granted so no folder picker here
export function NewNotebookDialog() {
  const createNotebook = useAppStore((s) => s.createNotebook)
  const loading = useAppStore((s) => s.loading)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveName = name.trim() || 'Untitled Notebook'
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
    const ok = await createNotebook(effectiveName)
    if (ok) onOpenChange(false)
    else setError(useAppStore.getState().error)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="ml-auto">
          <Plus aria-hidden />
          New
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New notebook</DialogTitle>
          <DialogDescription>
            Adds a notebook to this library.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="notebook-name">Name</Label>
            <Input
              id="notebook-name"
              name="notebook-name"
              autoComplete="off"
              spellCheck={false}
              placeholder="Untitled Notebook"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'notebook-name-error' : undefined}
            />
            {nameError && (
              <p id="notebook-name-error" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={!canCreate}>
              Create notebook
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
