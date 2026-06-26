import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { validateName } from '@/lib/fs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  //noun shown in the title, e.g. "page", "group", "notebook"
  kind: string
  currentName: string
  onClose: () => void
  //perform the rename, returns false on failure (store error is surfaced)
  onRename: (name: string) => Promise<boolean>
}

//rename a notebook, page, or group, prefilled with the current name
export function RenameDialog({ kind, currentName, onClose, onRename }: Props) {
  const loading = useAppStore((s) => s.loading)
  const [name, setName] = useState(currentName)
  const [error, setError] = useState<string | null>(null)

  const nameError = validateName(name)
  const canSave = !nameError && !loading

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (nameError) return
    const ok = await onRename(name.trim())
    if (ok) onClose()
    else setError(useAppStore.getState().error)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename {kind}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename-input">Name</Label>
            <Input
              id="rename-input"
              autoComplete="off"
              spellCheck={false}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
              aria-invalid={!!nameError}
            />
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
