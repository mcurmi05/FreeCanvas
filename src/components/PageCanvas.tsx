import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { PageEditor } from '@/components/PageEditor'

interface Props {
  pageKey: string
  content: string
  onSave: (html: string) => void
}

//a floating note container placed anywhere on the page
interface BoxMeta {
  id: string
  x: number
  y: number
  w: number
  html: string
}

const BOX_DEFAULT_W = 400
const SCROLL_PAD = 240

function rid(): string {
  return Math.random().toString(36).slice(2)
}

//split a saved page into its main document html and its floating boxes
//old pages have no wrapper, so the whole string is the document
function parsePage(content: string): { docHtml: string; boxes: BoxMeta[] } {
  if (!content.includes('data-canvas-doc')) {
    return { docHtml: content || '<p></p>', boxes: [] }
  }
  const tpl = document.createElement('template')
  tpl.innerHTML = content
  const docEl = tpl.content.querySelector('[data-canvas-doc]')
  const boxes: BoxMeta[] = []
  tpl.content.querySelectorAll<HTMLElement>('[data-canvas-box]').forEach((el) => {
    boxes.push({
      id: rid(),
      x: parseFloat(el.style.left) || 0,
      y: parseFloat(el.style.top) || 0,
      w: parseFloat(el.style.width) || BOX_DEFAULT_W,
      html: el.innerHTML,
    })
  })
  return { docHtml: docEl ? docEl.innerHTML : '<p></p>', boxes }
}

//stitch the document and boxes back into one html string for the page file
function serializePage(docHtml: string, boxes: BoxMeta[]): string {
  const boxHtml = boxes
    .map(
      (b) =>
        `<div data-canvas-box style="left:${Math.round(b.x)}px;top:${Math.round(
          b.y,
        )}px;width:${Math.round(b.w)}px">${b.html}</div>`,
    )
    .join('')
  return `<div data-canvas-doc>${docHtml}</div>${boxHtml}`
}

//onenote style page, a normal document plus floating text boxes you place
//anywhere on the blank white canvas, mounted fresh per page via its key
export function PageCanvas({ pageKey, content, onSave }: Props) {
  const wrapper = useRef<HTMLDivElement>(null)
  //the library's scrolling content node, where we portal the boxes layer
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null)

  const initial = useRef(parsePage(content))
  const docHtml = useRef(initial.current.docHtml)
  const [boxes, setBoxes] = useState<BoxMeta[]>(initial.current.boxes)
  //the html of each box lives in a ref so typing never re-renders the box
  const boxHtml = useRef<Record<string, string>>(
    Object.fromEntries(initial.current.boxes.map((b) => [b.id, b.html])),
  )
  //ignore the store echo of our own save, only adopt external content
  const lastSaved = useRef(content)
  const saveTimer = useRef<number | undefined>(undefined)

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const current = boxesWithHtml()
      const html = serializePage(docHtml.current, current)
      lastSaved.current = html
      onSave(html)
    }, 500)
    function boxesWithHtml() {
      return boxesRef.current.map((b) => ({ ...b, html: boxHtml.current[b.id] ?? b.html }))
    }
  }, [onSave])

  //keep a ref mirror of boxes so the debounced save sees the latest
  const boxesRef = useRef(boxes)
  useEffect(() => {
    boxesRef.current = boxes
  }, [boxes])

  //adopt content that came from outside (page switch, external load), but skip
  //the echo of our own writes so editing never clobbers itself
  useEffect(() => {
    if (content === lastSaved.current) return
    const parsed = parsePage(content)
    docHtml.current = parsed.docHtml
    boxHtml.current = Object.fromEntries(parsed.boxes.map((b) => [b.id, b.html]))
    setBoxes(parsed.boxes)
    lastSaved.current = content
  }, [content])

  //locate the editor's scrolling content node once it has mounted
  useEffect(() => {
    let raf = 0
    function find() {
      const el = wrapper.current?.querySelector<HTMLElement>('.rte-content')
      if (el) setContentEl(el)
      else raf = requestAnimationFrame(find)
    }
    find()
    return () => cancelAnimationFrame(raf)
  }, [pageKey])

  //mousedown on the blank canvas (not the document, not a box) creates a text
  //box, mousedown preventDefault keeps focus off the editor so the box keeps it
  useEffect(() => {
    if (!contentEl) return
    function onDown(e: MouseEvent) {
      if (e.button !== 0) return
      const t = e.target as HTMLElement
      if (t.closest('.ProseMirror') || t.closest('.canvas-box')) return
      e.preventDefault()
      const rect = contentEl!.getBoundingClientRect()
      const x = e.clientX - rect.left + contentEl!.scrollLeft
      const y = e.clientY - rect.top + contentEl!.scrollTop
      const box: BoxMeta = { id: rid(), x, y, w: BOX_DEFAULT_W, html: '' }
      boxHtml.current[box.id] = ''
      setBoxes((bs) => [...bs, box])
      setFocusId(box.id)
    }
    contentEl.addEventListener('mousedown', onDown)
    return () => contentEl.removeEventListener('mousedown', onDown)
  }, [contentEl])

  //which box should grab focus right after it mounts
  const [focusId, setFocusId] = useState<string | null>(null)

  function updateBox(id: string, patch: Partial<BoxMeta>) {
    setBoxes((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))
    scheduleSave()
  }

  function removeBox(id: string) {
    delete boxHtml.current[id]
    setBoxes((bs) => bs.filter((b) => b.id !== id))
    scheduleSave()
  }

  function onBoxInput(id: string, html: string) {
    boxHtml.current[id] = html
    scheduleSave()
  }

  //the document editor reports its html, fold it into the page and save
  function onDocChange(html: string) {
    docHtml.current = html
    scheduleSave()
  }

  //grow the scroll area so boxes dragged outward extend the canvas
  const extent = boxes.reduce(
    (acc, b) => ({
      w: Math.max(acc.w, b.x + b.w + SCROLL_PAD),
      h: Math.max(acc.h, b.y + 80 + SCROLL_PAD),
    }),
    { w: 0, h: 0 },
  )

  return (
    <div ref={wrapper} className="editor-fill relative min-h-0 flex-1">
      <PageEditor key={pageKey} content={docHtml.current} onSave={onDocChange} />

      {contentEl &&
        createPortal(
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: extent.w || undefined, height: extent.h || undefined }}
          >
            {boxes.map((b) => (
              <Box
                key={b.id}
                box={b}
                autoFocus={b.id === focusId}
                initialHtml={boxHtml.current[b.id] ?? b.html}
                onInput={(html) => onBoxInput(b.id, html)}
                onMove={(x, y) => updateBox(b.id, { x, y })}
                onResize={(w) => updateBox(b.id, { w })}
                onRemove={() => removeBox(b.id)}
              />
            ))}
          </div>,
          contentEl,
        )}
    </div>
  )
}

interface BoxProps {
  box: BoxMeta
  autoFocus: boolean
  initialHtml: string
  onInput: (html: string) => void
  onMove: (x: number, y: number) => void
  onResize: (w: number) => void
  onRemove: () => void
}

//a single draggable, editable text container
function Box({ box, autoFocus, initialHtml, onInput, onMove, onResize, onRemove }: BoxProps) {
  const body = useRef<HTMLDivElement>(null)

  //seed the editable html once, never rewrite it or the caret jumps
  useEffect(() => {
    if (body.current) body.current.innerHTML = initialHtml
    //focus after paint so a freshly created box reliably keeps the caret
    if (autoFocus) {
      requestAnimationFrame(() => {
        const el = body.current
        if (!el) return
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(true)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  //drag the header to reposition, clamped to the positive canvas
  function startDrag(e: React.PointerEvent) {
    e.preventDefault()
    const start = { px: e.clientX, py: e.clientY, x: box.x, y: box.y }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    function move(ev: PointerEvent) {
      onMove(
        Math.max(0, start.x + ev.clientX - start.px),
        Math.max(0, start.y + ev.clientY - start.py),
      )
    }
    function up(ev: PointerEvent) {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  //drag the right edge to resize the width
  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const start = { px: e.clientX, w: box.w }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    function move(ev: PointerEvent) {
      onResize(Math.max(80, start.w + ev.clientX - start.px))
    }
    function up(ev: PointerEvent) {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  //drop the box if it is left empty
  function onBlur() {
    if (!body.current) return
    if (!body.current.textContent?.trim() && !body.current.querySelector('img')) {
      onRemove()
    }
  }

  return (
    <div
      className="canvas-box group"
      style={{ left: box.x, top: box.y, width: box.w }}
      //stop canvas-create clicks from firing under the box
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/*drag handle and delete, shown on hover*/}
      <div className="absolute -top-5 left-0 flex h-5 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onPointerDown={startDrag}
          className="flex h-4 cursor-grab items-center rounded bg-accent px-2 text-[10px] text-muted-foreground active:cursor-grabbing"
          aria-label="move box"
        >
          ⠿
        </button>
        <button
          onClick={onRemove}
          className="grid size-4 place-items-center rounded bg-accent text-muted-foreground hover:text-destructive"
          aria-label="delete box"
        >
          <X className="size-3" />
        </button>
      </div>

      <div
        ref={body}
        className="canvas-box-body text-sm"
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onInput((e.target as HTMLElement).innerHTML)}
        onBlur={onBlur}
      />

      {/*right edge resize grip*/}
      <div
        onPointerDown={startResize}
        className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
        aria-hidden
      />
    </div>
  )
}
