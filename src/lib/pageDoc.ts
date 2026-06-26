//a page file holds the main document plus any floating boxes, wrapped so we can
//also stash metadata like the creation date. old pages are plain html with no
//wrapper, those are treated entirely as the document

//a floating note container placed on the canvas
export interface BoxMeta {
  id: string
  x: number
  y: number
  //undefined until the user drags to resize, then a fixed pixel width. while
  //undefined the box auto-sizes to its text
  w?: number
  html: string
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
    }
  }
  const tpl = document.createElement('template')
  tpl.innerHTML = content
  const docEl = tpl.content.querySelector('[data-canvas-doc]')
  const boxes: BoxMeta[] = []
  tpl.content.querySelectorAll<HTMLElement>('[data-canvas-box]').forEach((el) => {
    const w = parseFloat(el.style.width)
    boxes.push({
      id: rid(),
      x: parseFloat(el.style.left) || 0,
      y: parseFloat(el.style.top) || 0,
      //no stored width means the box still auto-sizes to its text
      w: isNaN(w) ? undefined : w,
      html: el.innerHTML,
    })
  })
  const dw = parseFloat(docEl?.getAttribute('data-doc-w') ?? '')
  return {
    docHtml: docEl ? docEl.innerHTML : '<p></p>',
    boxes,
    created: docEl?.getAttribute('data-created') || null,
    titleHidden: docEl?.getAttribute('data-title-hidden') === '1',
    docWidth: isNaN(dw) ? DEFAULT_DOC_WIDTH : dw,
  }
}

//stitch the document, boxes, and metadata back into one html string
export function serializePage(
  docHtml: string,
  boxes: BoxMeta[],
  created: string | null,
  titleHidden = false,
  docWidth = DEFAULT_DOC_WIDTH,
): string {
  const createdAttr = created ? ` data-created="${created}"` : ''
  const hiddenAttr = titleHidden ? ' data-title-hidden="1"' : ''
  //only write the width when it differs from the default, keeps files clean
  const widthAttr =
    Math.round(docWidth) === DEFAULT_DOC_WIDTH ? '' : ` data-doc-w="${Math.round(docWidth)}"`
  const boxHtml = boxes
    .map((b) => {
      //only write a width once the box has been resized, else it stays auto
      const w = b.w === undefined ? '' : `;width:${Math.round(b.w)}px`
      return `<div data-canvas-box style="left:${Math.round(b.x)}px;top:${Math.round(
        b.y,
      )}px${w}">${b.html}</div>`
    })
    .join('')
  return `<div data-canvas-doc${createdAttr}${hiddenAttr}${widthAttr}>${docHtml}</div>${boxHtml}`
}

//the contents of a brand new page, stamped with its creation date
export function blankPage(): string {
  return serializePage('<p></p>', [], new Date().toISOString())
}
