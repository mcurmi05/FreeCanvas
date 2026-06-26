import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { validateName } from '@/lib/fs'
import type { PageKind } from '@/types'
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

interface NewEntryDialogProps {
  kind: PageKind
  //omit for a top level entry, set to nest under a page or group
  parentPath?: string
  //the control that opens the dialog, omit when driving open externally
  trigger?: React.ReactNode
  //controlled open, pair with onOpenChange to drive from a menu
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const COPY = {
  page: {
    title: 'New page',
    description: 'Adds a page.',
    placeholder: 'Untitled Page',
    fallback: 'Untitled Page',
    submit: 'Create page',
  },
  group: {
    title: 'New group',
    description: 'Adds a group to hold pages.',
    placeholder: 'Untitled Group',
    fallback: 'Untitled Group',
    submit: 'Create group',
  },
} as const

//create a page or group, optionally nested under parentPath
export function NewEntryDialog({
  kind,
  parentPath,
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: NewEntryDialogProps) {
  const createNotebookPage = useAppStore((s) => s.createNotebookPage)
  const createNotebookGroup = useAppStore((s) => s.createNotebookGroup)
  const loading = useAppStore((s) => s.loading)
  const copy = COPY[kind]

  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveName = name.trim() || copy.fallback
  const nameError = touched ? validateName(effectiveName) : null
  const canCreate = !validateName(effectiveName) && !loading

  function onOpenChange(next: boolean) {
    setOpenState(next)
    onOpenChangeProp?.(next)
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
    const create = kind === 'page' ? createNotebookPage : createNotebookGroup
    const ok = await create(effectiveName, parentPath)
    if (ok) onOpenChange(false)
    else setError(useAppStore.getState().error)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-name">Name</Label>
            <Input
              id="entry-name"
              name="entry-name"
              autoComplete="off"
              spellCheck={false}
              placeholder={copy.placeholder}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'entry-name-error' : undefined}
            />
            {nameError && (
              <p id="entry-name-error" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={!canCreate}>
              {copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
