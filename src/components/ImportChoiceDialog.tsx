import { FileText, Paperclip, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

//how a non-image file should land on the page. 'pdfwindow' is a resizable
//viewport that scrolls the pdf inline, the rest as before
export type ImportChoice = 'attachment' | 'printout' | 'pdfwindow'

interface Props {
  //the file being imported, shown in the prompt. null keeps the dialog closed
  fileName: string | null
  //whether the file can be laid out as a printout (PDF only for now)
  canPrintout: boolean
  //resolve the prompt, null when the user dismisses without choosing
  onChoose: (choice: ImportChoice | null) => void
}

//asks whether a dropped file should be kept as a downloadable attachment or
//rendered as a printout (its pages rasterised onto the canvas)
export function ImportChoiceDialog({ fileName, canPrintout, onChoose }: Props) {
  return (
    <Dialog open={fileName !== null} onOpenChange={(o) => !o && onChoose(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import file</DialogTitle>
          <DialogDescription>
            How should <span className="font-medium">{fileName}</span> be added to the page?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-3 text-left"
            onClick={() => onChoose('attachment')}
          >
            <Paperclip className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex flex-col">
              <span className="font-medium">Attachment</span>
              <span className="text-xs text-muted-foreground">
                Keep the file, open or download it from the page
              </span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-3 text-left"
            disabled={!canPrintout}
            onClick={() => onChoose('printout')}
          >
            <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex flex-col">
              <span className="font-medium">Printout</span>
              <span className="text-xs text-muted-foreground">
                {canPrintout
                  ? "Lay the file's pages out as images on the canvas"
                  : 'Only PDFs can be laid out as a printout'}
              </span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-3 text-left"
            disabled={!canPrintout}
            onClick={() => onChoose('pdfwindow')}
          >
            <ScrollText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex flex-col">
              <span className="font-medium">PDF window</span>
              <span className="text-xs text-muted-foreground">
                {canPrintout
                  ? 'A single-page-sized window you scroll and resize freely'
                  : 'Only PDFs can be opened in a window'}
              </span>
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
