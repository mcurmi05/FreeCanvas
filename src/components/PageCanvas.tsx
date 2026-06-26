import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EyeOff, Plus } from 'lucide-react'
import { PageEditor } from '@/components/PageEditor'
import { validateName } from '@/lib/fs'
import { parsePage, rid, serializePage, type BoxMeta } from '@/lib/pageDoc'

interface Props {
  pageKey: string
  //the page's name, shown and edited in the title header
  pageName: string
  content: string
  onSave: (html: string) => void | Promise<void>
  //rename the page when the title is edited, returns false on failure
  onRenamePage: (name: string) => Promise<boolean>
}

const BOX_DEFAULT_W = 400
const SCROLL_PAD = 240

//the creation date and time, shown under the title the way onenote does
function formatCreated(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: '', time: '' }
  return {
    date: d.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    time: d
      .toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      .toLowerCase(),
  }
}

//onenote style page, a normal document plus floating text boxes you place
//anywhere on the blank white canvas, mounted fresh per page via its key
export function PageCanvas({ pageKey, pageName, content, onSave, onRenamePage }: Props) {
  const wrapper = useRef<HTMLDivElement>(null)
  //the library's scrolling content node, where we portal the title and boxes
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null)

  const initial = useRef(parsePage(content))
  const docHtml = useRef(initial.current.docHtml)
  const [boxes, setBoxes] = useState<BoxMeta[]>(initial.current.boxes)
  //the html of each box lives in a ref so typing never re-renders the box
  const boxHtml = useRef<Record<string, string>>(
    Object.fromEntries(initial.current.boxes.map((b) => [b.id, b.html])),
  )
  //creation date, stamp legacy pages that never had one
  const created = useRef(initial.current.created ?? new Date().toISOString())
  const [titleHidden, setTitleHidden] = useState(initial.current.titleHidden)
  const titleHiddenRef = useRef(titleHidden)
  //ignore the store echo of our own save, only adopt external content
  const lastSaved = useRef(content)
  const saveTimer = useRef<number | undefined>(undefined)

  function buildHtml(): string {
    const current = boxesRef.current.map((b) => ({
      ...b,
      html: boxHtml.current[b.id] ?? b.html,
    }))
    return serializePage(docHtml.current, current, created.current, titleHiddenRef.current)
  }

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const html = buildHtml()
      lastSaved.current = html
      onSave(html)
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSave])

  //write any pending changes right now, used before a rename copies the file
  async function flushSave() {
    window.clearTimeout(saveTimer.current)
    const html = buildHtml()
    lastSaved.current = html
    await onSave(html)
  }

  //keep a ref mirror of boxes so the debounced save sees the latest
  const boxesRef = useRef(boxes)
  useEffect(() => {
    boxesRef.current = boxes
  }, [boxes])
  useEffect(() => {
    titleHiddenRef.current = titleHidden
  }, [titleHidden])

  //persist a freshly stamped creation date on legacy pages that lacked one
  useEffect(() => {
    if (initial.current.created === null) scheduleSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  //adopt content that came from outside (page switch, external load), but skip
  //the echo of our own writes so editing never clobbers itself
  useEffect(() => {
    if (content === lastSaved.current) return
    const parsed = parsePage(content)
    docHtml.current = parsed.docHtml
    boxHtml.current = Object.fromEntries(parsed.boxes.map((b) => [b.id, b.html]))
    created.current = parsed.created ?? created.current
    setBoxes(parsed.boxes)
    setTitleHidden(parsed.titleHidden)
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
      if (
        t.closest('.ProseMirror') ||
        t.closest('.canvas-box') ||
        t.closest('.page-title') ||
        t.closest('.page-title-add')
      )
        return
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

  //the page title is an editable div, seed it once so the caret never jumps
  //a div avoids the input element's focused vs blurred look differences
  const titleRef = useRef<HTMLDivElement>(null)
  const [titleMenu, setTitleMenu] = useState<{ x: number; y: number } | null>(null)

  //seed the title text whenever the element mounts (it is portaled in after
  //the editor's content node is found) or the page changes, but never while
  //the user is editing it
  useEffect(() => {
    const el = titleRef.current
    if (el && document.activeElement !== el) el.textContent = pageName
  }, [pageName, contentEl, titleHidden])

  function resetTitle() {
    if (titleRef.current) titleRef.current.textContent = pageName
  }

  async function commitTitle() {
    const next = (titleRef.current?.textContent ?? '').trim()
    if (!next || next === pageName || validateName(next)) {
      resetTitle()
      return
    }
    //flush pending edits first so the rename copies the latest content
    await flushSave()
    const ok = await onRenamePage(next)
    if (!ok) resetTitle()
  }

  function hideTitle() {
    setTitleHidden(true)
    setTitleMenu(null)
    scheduleSave()
  }

  function showTitle() {
    setTitleHidden(false)
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
          <>
            {titleHidden ? (
              <button
                className="page-title-add"
                onClick={showTitle}
                title="show the title"
              >
                <Plus className="size-3.5" aria-hidden />
                Add title
              </button>
            ) : (
              <div
                className="page-title"
                onContextMenu={(e) => {
                  e.preventDefault()
                  setTitleMenu({ x: e.clientX, y: e.clientY })
                }}
              >
                <div
                  ref={titleRef}
                  className="page-title-input"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  data-placeholder="Untitled page"
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    } else if (e.key === 'Escape') {
                      resetTitle()
                      e.currentTarget.blur()
                    }
                  }}
                />
                <div className="page-title-rule" />
                <div className="page-title-date">
                  <span>{formatCreated(created.current).date}</span>
                  <span className="page-title-time">
                    {formatCreated(created.current).time}
                  </span>
                </div>
              </div>
            )}

            <div
              //tiptap pins the prosemirror layer at z-index:0, lift the box
              //overlay above it or the editor paints over boxes and eats hits
              className="pointer-events-none absolute left-0 top-0 z-10"
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
            </div>
          </>,
          contentEl,
        )}

      {titleMenu && (
        <TitleMenu menu={titleMenu} onClose={() => setTitleMenu(null)} onHide={hideTitle} />
      )}
    </div>
  )
}

//tiny right click menu for the title header
function TitleMenu({
  menu,
  onClose,
  onHide,
}: {
  menu: { x: number; y: number }
  onClose: () => void
  onHide: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      role="menu"
      className="fixed z-50 min-w-40 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        role="menuitem"
        onClick={onHide}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none hover:bg-accent"
      >
        <EyeOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Hide title area
      </button>
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
  //grey line on hover/focus is a box-shadow ring not a border: tailwind preflight
  //resets border-width to 0 on every element so a border colour never paints,
  //but box-shadow is untouched. driven by css :hover/:focus-within in global.css

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
    //pin the 4-way move cursor for the whole drag, not just over the frame
    document.body.style.cursor = 'move'
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
      document.body.style.cursor = ''
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
      {/*the frame is the drag handle, grab it to move. the inner text stops
         propagation so clicking it edits instead. grey ring on hover/focus
         lives in global.css*/}
      <div className="canvas-box-frame" onPointerDown={startDrag}>
        <div
          ref={body}
          className="canvas-box-text text-sm"
          contentEditable
          suppressContentEditableWarning
          onPointerDown={(e) => e.stopPropagation()}
          //escape deselects, blur drops focus and clears the selection
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement).blur()
            }
          }}
          onInput={(e) => onInput((e.target as HTMLElement).innerHTML)}
          onBlur={onBlur}
        />
      </div>

      {/*right edge resize grip*/}
      <div
        onPointerDown={startResize}
        className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
        aria-hidden
      />
    </div>
  )
}
