//a page file holds the main document plus any floating boxes, wrapped so we can
//also stash metadata like the creation date. old pages are plain html with no
//wrapper, those are treated entirely as the document

//a floating note container placed on the canvas. most boxes are text, but a
//box can also hold an imported image or an attachment widget
export interface BoxMeta {
  id: string
  x: number
  y: number
  //undefined until the user drags to resize, then a fixed pixel width. while
  //undefined the box auto-sizes to its text
  w?: number
  //explicit pixel height, image boxes only, set once stretched or scaled. when
  //undefined an image sizes its height from its width and aspect ratio
  h?: number
  html: string
  //what the box holds, defaults to text. omitted on disk for clean text files.
  //'pdf' is a resizable window scrolling the original pdf inline
  kind?: 'text' | 'image' | 'attachment' | 'pdf'
  //filename inside the page's attachments/ folder, image and attachment boxes
  file?: string
  //mime of the stored file, drives image vs attachment handling on reload
  mime?: string
  //display name shown for an attachment, also alt text for an image
  name?: string
  //width/height ratio of an image, keeps resize aspect-locked
  aspect?: number
  //corner rounding in px, image boxes only
  radius?: number
  //pdf window view: 'scroll' (native continuous viewer) or 'slides' (one page
  //at a time with arrows). absent means scroll
  mode?: 'scroll' | 'slides'
  //horizontal pin: 'left' sticks to the canvas left edge, 'right' to the doc
  //width marker (and follows it). absent means free positioning via x
  justify?: 'left' | 'right'
  //visible crop region as fractions of the original image (x,y top-left, w,h
  //size, all 0..1). absent means the whole image is shown
  crop?: { x: number; y: number; w: number; h: number }
  //whole-box text styling (font/size/line-height/colors) set from the toolbar,
  //stored as the .canvas-box-text element's style.cssText. text boxes only
  textStyle?: string
}

//escape a string for use inside a double-quoted html attribute
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function rid(): string {
  return Math.random().toString(36).slice(2)
}

export interface ParsedPage {
  docHtml: string
  boxes: BoxMeta[]
  //iso string of when the page was created, null on legacy pages
  created: string | null
  //whether the title header is hidden for this page
  titleHidden: boolean
  //width of the document text column in px, set by the width marker
  docWidth: number
  //toolbar-set title styling, absent means the default look
  titleFont?: string
  titleSize?: string
}

//default document text column width, used for legacy pages and new pages, and
//the right-click reset target. picked so the page (text + 80px h-padding) is
//roughly A4 width: 210mm at 96dpi ≈ 794px, minus the padding ≈ 714px
export const DEFAULT_DOC_WIDTH = 714

//split a saved page into its document, boxes, and metadata
export function parsePage(content: string): ParsedPage {
  if (!content.includes('data-canvas-doc')) {
    return {
      docHtml: content || '<p></p>',
      boxes: [],
      created: null,
      titleHidden: false,
      docWidth: DEFAULT_DOC_WIDTH,
      titleFont: undefined,
      titleSize: undefined,
    }
  }
  const tpl = document.createElement('template')
  tpl.innerHTML = content
  const docEl = tpl.content.querySelector('[data-canvas-doc]')
  const boxes: BoxMeta[] = []
  tpl.content.querySelectorAll<HTMLElement>('[data-canvas-box]').forEach((el) => {
    const w = parseFloat(el.style.width)
    const h = parseFloat(el.style.height)
    const kindAttr = el.getAttribute('data-kind')
    const kind =
      kindAttr === 'image' || kindAttr === 'attachment' || kindAttr === 'pdf'
        ? kindAttr
        : undefined
    const aspect = parseFloat(el.getAttribute('data-aspect') ?? '')
    const radius = parseFloat(el.getAttribute('data-radius') ?? '')
    const modeAttr = el.getAttribute('data-mode')
    const mode = modeAttr === 'slides' ? 'slides' : undefined
    const justifyAttr = el.getAttribute('data-justify')
    const justify =
      justifyAttr === 'left' || justifyAttr === 'right' ? justifyAttr : undefined
    //crop is four comma-separated fractions: x,y,w,h
    const cropParts = (el.getAttribute('data-crop') ?? '').split(',').map(Number)
    const crop =
      cropParts.length === 4 && cropParts.every((n) => !isNaN(n))
        ? { x: cropParts[0], y: cropParts[1], w: cropParts[2], h: cropParts[3] }
        : undefined
    boxes.push({
      id: rid(),
      x: parseFloat(el.style.left) || 0,
      y: parseFloat(el.style.top) || 0,
      //no stored width means the box still auto-sizes to its text
      w: isNaN(w) ? undefined : w,
      h: isNaN(h) ? undefined : h,
      //media boxes carry no inner html, the file is resolved at runtime
      html: kind ? '' : el.innerHTML,
      kind,
      file: el.getAttribute('data-attachment') || undefined,
      mime: el.getAttribute('data-mime') || undefined,
      name: el.getAttribute('data-name') || undefined,
      aspect: isNaN(aspect) ? undefined : aspect,
      radius: isNaN(radius) ? undefined : radius,
      mode,
      justify,
      crop,
      textStyle: el.getAttribute('data-text-style') || undefined,
    })
  })
  const dw = parseFloat(docEl?.getAttribute('data-doc-w') ?? '')
  return {
    docHtml: docEl ? docEl.innerHTML : '<p></p>',
    boxes,
    created: docEl?.getAttribute('data-created') || null,
    titleHidden: docEl?.getAttribute('data-title-hidden') === '1',
    docWidth: isNaN(dw) ? DEFAULT_DOC_WIDTH : dw,
    titleFont: docEl?.getAttribute('data-title-font') || undefined,
    titleSize: docEl?.getAttribute('data-title-size') || undefined,
  }
}

//stitch the document, boxes, and metadata back into one html string
export function serializePage(
  docHtml: string,
  boxes: BoxMeta[],
  created: string | null,
  titleHidden = false,
  docWidth = DEFAULT_DOC_WIDTH,
  titleFont?: string,
  titleSize?: string,
): string {
  const createdAttr = created ? ` data-created="${created}"` : ''
  const hiddenAttr = titleHidden ? ' data-title-hidden="1"' : ''
  //only write title styling when set, keeps files clean
  const titleFontAttr = titleFont ? ` data-title-font="${escapeAttr(titleFont)}"` : ''
  const titleSizeAttr = titleSize ? ` data-title-size="${escapeAttr(titleSize)}"` : ''
  //only write the width when it differs from the default, keeps files clean
  const widthAttr =
    Math.round(docWidth) === DEFAULT_DOC_WIDTH ? '' : ` data-doc-w="${Math.round(docWidth)}"`
  const boxHtml = boxes
    .map((b) => {
      //only write a width once the box has been resized, else it stays auto
      const w = b.w === undefined ? '' : `;width:${Math.round(b.w)}px`
      //height is image-only, written once the box has been scaled or stretched
      const h = b.h === undefined ? '' : `;height:${Math.round(b.h)}px`
      //media metadata, only present on image and attachment boxes. text boxes
      //write none of these and keep their old clean markup
      const media =
        b.kind && b.kind !== 'text'
          ? ` data-kind="${b.kind}"` +
            (b.file ? ` data-attachment="${escapeAttr(b.file)}"` : '') +
            (b.mime ? ` data-mime="${escapeAttr(b.mime)}"` : '') +
            (b.name ? ` data-name="${escapeAttr(b.name)}"` : '') +
            (b.aspect ? ` data-aspect="${b.aspect}"` : '') +
            (b.radius ? ` data-radius="${Math.round(b.radius)}"` : '') +
            (b.mode === 'slides' ? ` data-mode="slides"` : '') +
            (b.crop
              ? ` data-crop="${[b.crop.x, b.crop.y, b.crop.w, b.crop.h]
                  .map((n) => +n.toFixed(4))
                  .join(',')}"`
              : '')
          : ''
      //media boxes hold no inner html, only text boxes carry content
      const inner = b.kind && b.kind !== 'text' ? '' : b.html
      //justify applies to every kind, so it lives outside the media block
      const justifyAttr = b.justify ? ` data-justify="${b.justify}"` : ''
      //whole-box text styling from the toolbar, text boxes only
      const textStyleAttr =
        b.textStyle && !(b.kind && b.kind !== 'text')
          ? ` data-text-style="${escapeAttr(b.textStyle)}"`
          : ''
      return `<div data-canvas-box style="left:${Math.round(b.x)}px;top:${Math.round(
        b.y,
      )}px${w}${h}"${media}${justifyAttr}${textStyleAttr}>${inner}</div>`
    })
    .join('')
  return `<div data-canvas-doc${createdAttr}${hiddenAttr}${widthAttr}${titleFontAttr}${titleSizeAttr}>${docHtml}</div>${boxHtml}`
}

//the contents of a brand new page, stamped with its creation date
export function blankPage(): string {
  return serializePage('<p></p>', [], new Date().toISOString())
}
