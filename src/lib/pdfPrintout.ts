import * as pdfjs from 'pdfjs-dist'
//bundled worker, resolved to a url by vite
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

//one rasterised pdf page: a png blob plus its width/height ratio
export interface PrintoutPage {
  blob: Blob
  aspect: number
}

//cap the long edge of a rendered page so big documents stay a sane size
const MAX_EDGE = 2000

//render every page of a pdf to a png blob. data is consumed, pass a fresh
//buffer. shouldContinue gets the page count before any rendering and can abort
//(return false) for very large documents
export async function rasterizePdf(
  data: ArrayBuffer,
  shouldContinue?: (numPages: number) => boolean,
): Promise<PrintoutPage[]> {
  const pdf = await pdfjs.getDocument({ data }).promise
  if (shouldContinue && !shouldContinue(pdf.numPages)) return []
  //legible without being huge, clamped by the max edge below
  const base = Math.min(2, (window.devicePixelRatio || 1) * 1.5)
  const pages: PrintoutPage[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    let viewport = page.getViewport({ scale: base })
    const longEdge = Math.max(viewport.width, viewport.height)
    if (longEdge > MAX_EDGE) {
      viewport = page.getViewport({ scale: base * (MAX_EDGE / longEdge) })
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    )
    if (blob) pages.push({ blob, aspect: viewport.width / viewport.height })
  }
  return pages
}
