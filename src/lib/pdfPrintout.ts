import * as pdfjs from 'pdfjs-dist'
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
  TextLayer,
} from 'pdfjs-dist'
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

//width/height ratio of a pdf's first page, used to size a pdf window so it
//opens roughly page-shaped. data is consumed, pass a fresh buffer. falls back
//to A4 portrait (≈0.707) if the page can't be read
export async function firstPageAspect(data: ArrayBuffer): Promise<number> {
  try {
    const pdf = await pdfjs.getDocument({ data }).promise
    const vp = (await pdf.getPage(1)).getViewport({ scale: 1 })
    return vp.width && vp.height ? vp.width / vp.height : 0.707
  } catch {
    return 0.707
  }
}

//width/height ratio of every page in a pdf, in order. used to size a pdf window
//to its full scrolled height. data is consumed, pass a fresh buffer
export async function pageAspects(data: ArrayBuffer): Promise<number[]> {
  const pdf = await pdfjs.getDocument({ data }).promise
  const out: number[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const vp = (await pdf.getPage(i)).getViewport({ scale: 1 })
    out.push(vp.width && vp.height ? vp.width / vp.height : 0.707)
  }
  return out
}

//open a pdf for interactive page-by-page rendering (slideshow mode). returns the
//loading task: await .promise for the document, and call .destroy() on the task
//(not the document — PDFDocumentProxy has no destroy) to tear down and terminate
//the worker when done. data is consumed, pass a fresh buffer
export function openPdf(data: ArrayBuffer): PDFDocumentLoadingTask {
  return pdfjs.getDocument({ data })
}

//render one page of an open pdf into a canvas, scaled to fit within maxW x maxH
//css pixels (the whole page stays visible, slideshow style). renders at the
//device pixel ratio (capped) for sharpness. returns the RenderTask so the
//caller can .cancel() it (e.g. on unmount) before the pdf is destroyed, which
//otherwise leaves an in-flight render rejecting against a torn-down document
//zoom multiplies the fit scale: 1 fills the window, >1 overflows (pannable).
//returns the render task plus the page's css size, so the caller can size a
//window to exactly hold the page at the current zoom
//pass a container to also render a selectable text layer over the canvas. the
//returned textLayer (if any) must be .cancel()'d alongside the render task
export async function renderPdfPage(
  pdf: PDFDocumentProxy,
  num: number,
  canvas: HTMLCanvasElement,
  maxW: number,
  maxH: number,
  zoom = 1,
  textContainer?: HTMLDivElement,
): Promise<{ task: RenderTask; cssW: number; cssH: number; textLayer?: TextLayer }> {
  const page = await pdf.getPage(num)
  const base = page.getViewport({ scale: 1 })
  const fit = Math.min(maxW / base.width, maxH / base.height) * zoom
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const viewport = page.getViewport({ scale: fit * dpr })
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const cssW = Math.floor(viewport.width / dpr)
  const cssH = Math.floor(viewport.height / dpr)
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  const task = page.render({ canvasContext: ctx, viewport, canvas })
  let textLayer: TextLayer | undefined
  if (textContainer) {
    //the text layer lays out at css scale (no dpr); its transparent spans sit
    //over the canvas so the user can select and copy real text
    const { TextLayer, setLayerDimensions } = await import('pdfjs-dist')
    const cssViewport = page.getViewport({ scale: fit })
    textContainer.replaceChildren()
    setLayerDimensions(textContainer, cssViewport)
    textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container: textContainer,
      viewport: cssViewport,
    })
    void textLayer.render().catch(() => {})
  }
  return { task, cssW, cssH, textLayer }
}

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
