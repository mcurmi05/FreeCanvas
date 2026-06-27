import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { EyeOff } from 'lucide-react'
import { PageEditor } from '@/components/PageEditor'
import { ImagePlus } from 'lucide-react'
import { attachmentUrl } from '@/lib/attachments'
import { importImage, isImage } from '@/lib/importFiles'
import { validateName } from '@/lib/fs'
import { DEFAULT_DOC_WIDTH, parsePage, rid, serializePage, type BoxMeta } from '@/lib/pageDoc'

interface Props {
  pageKey: string
  //the page's name, shown and edited in the title header
  pageName: string
  content: string
  //the page's backing folder, where imported attachments live. undefined until
  //the page is promoted to a folder on first import
  pageDir?: FileSystemDirectoryHandle
  //promote the page to a folder if needed and return its backing dir, used to
  //land the first import
  ensurePageDir: () => Promise<FileSystemDirectoryHandle | null>
  onSave: (html: string) => void | Promise<void>
  //rename the page when the title is edited, returns false on failure
  onRenamePage: (name: string) => Promise<boolean>
  //bumped from the sidebar menu to toggle the title shown/hidden
  toggleTitleNonce?: number
  //report the current title visibility so the sidebar can label its menu item
  onTitleHiddenChange?: (hidden: boolean) => void
}

//new boxes auto-size to their text and grow until this width, then wrap. once
//the user drags the edge the box stores a fixed width and ignores this
const BOX_MAX_W = 520
//default on-canvas width for a freshly imported image, before any resize
const DEFAULT_IMG_W = 360
const SCROLL_PAD = 240
//frame padding (.canvas-box-frame), subtracted on create so the caret lands
//on the click point rather than offset by the padding
const BOX_PAD_X = 10
const BOX_PAD_Y = 8

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
export function PageCanvas({
  pageKey,
  pageName,
  content,
  pageDir,
  ensurePageDir,
  onSave,
  onRenamePage,
  toggleTitleNonce,
  onTitleHiddenChange,
}: Props) {
  const wrapper = useRef<HTMLDivElement>(null)
  //the library's scrolling content node, where we portal the title and boxes
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null)
  const initial = useRef(parsePage(content))
  //width of the document text column, dragged via the marker at the top of the
  //canvas and fed to the prosemirror max-width via the --doc-w css variable
  const [docW, setDocW] = useState(initial.current.docWidth)
  const docWRef = useRef(docW)
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
    return serializePage(
      docHtml.current,
      current,
      created.current,
      titleHiddenRef.current,
      docWRef.current,
    )
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

  //resolved object urls for media boxes, keyed by stored filename. kept in a ref
  //so revoking on unmount is reliable, a counter bumps a re-render once a url lands
  const mediaUrls = useRef<Map<string, string>>(new Map())
  const [, bumpUrls] = useReducer((x: number) => x + 1, 0)

  //resolve an object url for every image/attachment box that has a stored file
  useEffect(() => {
    if (!pageDir) return
    let cancelled = false
    const files = boxes
      .filter((b) => (b.kind === 'image' || b.kind === 'attachment') && b.file)
      .map((b) => b.file as string)
    ;(async () => {
      for (const file of files) {
        if (mediaUrls.current.has(file)) continue
        const url = await attachmentUrl(pageDir, file)
        if (cancelled || !url) continue
        mediaUrls.current.set(file, url)
        bumpUrls()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [boxes, pageDir])

  //revoke every object url when the page unmounts so blobs do not leak
  useEffect(
    () => () => {
      mediaUrls.current.forEach((u) => URL.revokeObjectURL(u))
      mediaUrls.current.clear()
    },
    [],
  )
  useEffect(() => {
    titleHiddenRef.current = titleHidden
  }, [titleHidden])
  useEffect(() => {
    docWRef.current = docW
  }, [docW])

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
    setDocW(parsed.docWidth)
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

  //mirror the content node and latest import handler into refs so the paste
  //listener, attached once in capture phase, always sees the current values
  const contentElRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    contentElRef.current = contentEl
  }, [contentEl])
  const importRef = useRef<
    (files: FileList | File[], x: number, y: number) => void
  >(() => {})

  //intercept pasted images anywhere on the page (document, a box, or the bare
  //canvas) in capture phase, before prosemirror or a contentEditable can embed
  //them. route them through the same import path as drop so behaviour matches
  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    function onPaste(e: ClipboardEvent) {
      const dt = e.clipboardData
      if (!dt) return
      const imgs: File[] = []
      for (const item of Array.from(dt.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile()
          //clipboard images often have no name, give them a stable one
          if (f) imgs.push(f.name ? f : new File([f], 'pasted-image.png', { type: f.type }))
        }
      }
      if (!imgs.length) return
      e.preventDefault()
      e.stopPropagation()
      //drop at the caret when we can locate it, else near the top of the view
      const ce = contentElRef.current
      const rect = ce?.getBoundingClientRect()
      const sel = window.getSelection()
      let x = (ce?.scrollLeft ?? 0) + 80
      let y = (ce?.scrollTop ?? 0) + 140
      if (ce && rect && sel && sel.rangeCount) {
        const r = sel.getRangeAt(0).getBoundingClientRect()
        if (r.width || r.height || r.left) {
          x = r.left - rect.left + ce.scrollLeft - BOX_PAD_X
          y = r.top - rect.top + ce.scrollTop - BOX_PAD_Y
        }
      }
      importRef.current(imgs, Math.max(0, x), Math.max(0, y))
    }
    el.addEventListener('paste', onPaste, true)
    return () => el.removeEventListener('paste', onPaste, true)
  }, [])

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
        t.closest('.doc-width-bar')
      )
        return
      const rect = contentEl!.getBoundingClientRect()
      //ignore clicks on the native scrollbars (past the content area), else
      //grabbing the bottom/right scrollbar would drop a box and jump-scroll
      if (
        e.clientX - rect.left > contentEl!.clientWidth ||
        e.clientY - rect.top > contentEl!.clientHeight
      )
        return
      e.preventDefault()
      const x = e.clientX - rect.left + contentEl!.scrollLeft - BOX_PAD_X
      const y = e.clientY - rect.top + contentEl!.scrollTop - BOX_PAD_Y
      //no width yet, the box auto-sizes to its text until dragged
      const box: BoxMeta = { id: rid(), x: Math.max(0, x), y: Math.max(0, y), html: '' }
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
    //revoke the box's object url if it had one, the stored file stays on disk
    const box = boxesRef.current.find((b) => b.id === id)
    if (box?.file) {
      const url = mediaUrls.current.get(box.file)
      if (url) {
        URL.revokeObjectURL(url)
        mediaUrls.current.delete(box.file)
      }
    }
    delete boxHtml.current[id]
    setBoxes((bs) => bs.filter((b) => b.id !== id))
    scheduleSave()
  }

  function onBoxInput(id: string, html: string) {
    boxHtml.current[id] = html
    scheduleSave()
  }

  //convert a viewport point into canvas content coordinates, matching the
  //create-box math so a dropped file lands under the pointer
  function contentPoint(clientX: number, clientY: number) {
    if (!contentEl) return { x: 0, y: 0 }
    const rect = contentEl.getBoundingClientRect()
    return {
      x: clientX - rect.left + contentEl.scrollLeft - BOX_PAD_X,
      y: clientY - rect.top + contentEl.scrollTop - BOX_PAD_Y,
    }
  }

  //import dropped or picked files onto the canvas. images insert silently as
  //image boxes, stacked with a small offset when several arrive at once
  async function importFiles(files: FileList | File[], x: number, y: number) {
    const list = Array.from(files)
    if (!list.length) return
    //first import promotes a leaf page to a folder so it can hold attachments
    const dir = pageDir ?? (await ensurePageDir())
    if (!dir) return
    let offset = 0
    for (const file of list) {
      if (isImage(file)) {
        const box = await importImage(dir, file, Math.max(0, x + offset), Math.max(0, y + offset))
        setBoxes((bs) => [...bs, box])
        scheduleSave()
        offset += 24
      }
      //non-image files get an attachment/printout prompt in a later step
    }
  }
  //keep the paste listener pointed at the latest closure (current pageDir etc.)
  importRef.current = importFiles

  //the toolbar import button feeds files through a hidden picker
  const fileInput = useRef<HTMLInputElement>(null)
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files?.length) {
      //land picked files near the top-left of the current view
      const x = (contentEl?.scrollLeft ?? 0) + 80
      const y = (contentEl?.scrollTop ?? 0) + 140
      importFiles(files, x, y)
    }
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    const { x, y } = contentPoint(e.clientX, e.clientY)
    importFiles(e.dataTransfer.files, x, y)
  }

  function onDragOver(e: React.DragEvent) {
    //only intercept file drags, leave internal drags to their own handlers
    if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault()
  }

  //right-click the marker to reset the document to the default (A4) width
  function resetWidth(e: React.MouseEvent) {
    e.preventDefault()
    docWRef.current = DEFAULT_DOC_WIDTH
    setDocW(DEFAULT_DOC_WIDTH)
    scheduleSave()
  }

  //drag the marker at the top of the canvas to resize the document text column.
  //the text edge tracks the pointer in content coords, and when the pointer
  //reaches the right edge we auto-scroll and keep growing so it can go past the
  //viewport without limit
  function startWidthDrag(e: React.PointerEvent) {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    //near this distance from the right edge, start auto-scrolling and growing
    const EDGE = 48
    const STEP = 14
    let lastX = e.clientX
    let raf = 0

    function applyWidth(w: number) {
      const next = Math.round(Math.max(80, w))
      docWRef.current = next
      setDocW(next)
      scheduleSave()
    }

    //while the pointer sits in the edge zone, grow + scroll once per frame
    function tick() {
      raf = 0
      if (!contentEl) return
      const rect = contentEl.getBoundingClientRect()
      if (lastX > rect.right - EDGE) {
        contentEl.scrollLeft += STEP
        applyWidth(docWRef.current + STEP)
        raf = requestAnimationFrame(tick)
      }
    }

    function move(ev: PointerEvent) {
      lastX = ev.clientX
      if (!contentEl) return
      const rect = contentEl.getBoundingClientRect()
      if (ev.clientX > rect.right - EDGE) {
        if (!raf) raf = requestAnimationFrame(tick)
      } else {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        //text edge = pointer position in content coords, minus the 40px left pad
        const contentX = ev.clientX - rect.left + contentEl.scrollLeft
        applyWidth(contentX - 40)
      }
    }
    function up(ev: PointerEvent) {
      if (raf) cancelAnimationFrame(raf)
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
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

  //the sidebar menu bumps this nonce to flip the title shown/hidden
  useEffect(() => {
    if (toggleTitleNonce) {
      setTitleHidden((h) => !h)
      scheduleSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggleTitleNonce])

  //let the sidebar know the current visibility for its menu label
  useEffect(() => {
    onTitleHiddenChange?.(titleHidden)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleHidden])

  //grow the scroll area so boxes dragged outward extend the canvas. an image
  //box can be tall, estimate its height from its width and aspect ratio
  const extent = boxes.reduce((acc, b) => {
    const w = b.w ?? (b.kind === 'image' ? DEFAULT_IMG_W : BOX_MAX_W)
    const h =
      b.kind === 'image' ? (b.h ?? (b.aspect ? w / b.aspect : w)) : 80
    return {
      w: Math.max(acc.w, b.x + w + SCROLL_PAD),
      h: Math.max(acc.h, b.y + h + SCROLL_PAD),
    }
  }, { w: 0, h: 0 })

  return (
    <div
      ref={wrapper}
      className="editor-fill relative min-h-0 flex-1"
      style={{ '--doc-w': `${docW}px` } as CSSProperties}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <PageEditor key={pageKey} content={docHtml.current} onSave={onDocChange} />

      {/*hidden picker + import button, vertically centered in the 48px toolbar
         strip at the top of the editor*/}
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={onPickFiles}
      />
      <div className="absolute right-4 top-0 z-20 flex h-12 items-center">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-sm shadow-sm outline-none hover:bg-accent"
          title="import images or files onto this page"
        >
          <ImagePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Import
        </button>
      </div>

      {contentEl &&
        createPortal(
          <>
            {/*marker pinned to the top of the canvas, points down at the right
               edge of the text. drag it left/right to set the document width*/}
            <div className="doc-width-bar">
              <div
                className="doc-width-marker"
                onPointerDown={startWidthDrag}
                onContextMenu={resetWidth}
                title="drag to set the document width, right-click to reset"
                role="slider"
                aria-label="document width"
                aria-valuenow={docW}
                aria-valuemin={80}
              />
            </div>

            {/*title hidden: nothing here, bring it back via the sidebar
               right-click menu (which bumps toggleTitleNonce)*/}
            {!titleHidden && (
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
              {boxes.map((b) =>
                b.kind === 'image' ? (
                  <ImageBox
                    key={b.id}
                    box={b}
                    url={b.file ? mediaUrls.current.get(b.file) : undefined}
                    onGeom={(patch) => updateBox(b.id, patch)}
                    onRemove={() => removeBox(b.id)}
                  />
                ) : (
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
                ),
              )}
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

//the eight resize handles around an image. corners scale (keep the current w/h
//ratio), edges stretch one dimension freely
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: { dir: ResizeDir; cls: string; cursor: string }[] = [
  { dir: 'nw', cls: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
  { dir: 'n', cls: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'ns-resize' },
  { dir: 'ne', cls: 'right-0 top-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
  { dir: 'e', cls: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { dir: 'se', cls: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
  { dir: 's', cls: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 'ns-resize' },
  { dir: 'sw', cls: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
  { dir: 'w', cls: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
]
const MIN_IMG = 40

//a non-editable image dropped on the canvas. click to select (then Delete or
//Backspace removes it), drag the body to move, drag a corner to scale or an
//edge to stretch
function ImageBox({
  box,
  url,
  onGeom,
  onRemove,
}: {
  box: BoxMeta
  url?: string
  onGeom: (patch: Partial<BoxMeta>) => void
  onRemove: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(false)
  const w = box.w ?? DEFAULT_IMG_W
  const h = box.h ?? (box.aspect ? w / box.aspect : w)

  //drag the body to reposition, clamped to the positive canvas
  function startDrag(e: React.PointerEvent) {
    e.preventDefault()
    ref.current?.focus()
    const start = { px: e.clientX, py: e.clientY, x: box.x, y: box.y }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'move'
    function move(ev: PointerEvent) {
      onGeom({
        x: Math.max(0, start.x + ev.clientX - start.px),
        y: Math.max(0, start.y + ev.clientY - start.py),
      })
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

  //resize from a handle. corners (two-letter dir) scale uniformly, edges move
  //a single side. the opposite side stays pinned by shifting x/y as needed
  function startResize(e: React.PointerEvent, dir: ResizeDir) {
    e.preventDefault()
    e.stopPropagation()
    ref.current?.focus()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const s = { px: e.clientX, py: e.clientY, x: box.x, y: box.y, w, h }
    function move(ev: PointerEvent) {
      const dx = ev.clientX - s.px
      const dy = ev.clientY - s.py
      let { x, y, w: nw, h: nh } = s
      if (dir.length === 2) {
        //corner scale, drive the new width by the horizontal drag then keep the
        //starting ratio for the height
        const right = dir.includes('e')
        nw = Math.max(MIN_IMG, right ? s.w + dx : s.w - dx)
        const scale = nw / s.w
        nh = s.h * scale
        if (!right) x = s.x + (s.w - nw)
        if (!dir.includes('s')) y = s.y + (s.h - nh)
      } else if (dir === 'e') {
        nw = Math.max(MIN_IMG, s.w + dx)
      } else if (dir === 'w') {
        nw = Math.max(MIN_IMG, s.w - dx)
        x = s.x + (s.w - nw)
      } else if (dir === 's') {
        nh = Math.max(MIN_IMG, s.h + dy)
      } else if (dir === 'n') {
        nh = Math.max(MIN_IMG, s.h - dy)
        y = s.y + (s.h - nh)
      }
      onGeom({ x, y, w: nw, h: nh })
    }
    function up(ev: PointerEvent) {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={ref}
      className={`canvas-box canvas-image${selected ? ' is-selected' : ''}`}
      style={{ left: box.x, top: box.y, width: w, height: h }}
      tabIndex={0}
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={() => setSelected(true)}
      onBlur={() => setSelected(false)}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          onRemove()
        }
      }}
    >
      <div className="canvas-image-frame" onPointerDown={startDrag}>
        {url ? (
          <img src={url} alt={box.name ?? ''} draggable={false} />
        ) : (
          <div className="canvas-image-loading" />
        )}
      </div>

      {/*handles only while selected: corners scale, edges stretch*/}
      {selected &&
        HANDLES.map((hd) => (
          <div
            key={hd.dir}
            className={`canvas-image-handle absolute ${hd.cls}`}
            style={{ cursor: hd.cursor }}
            onPointerDown={(e) => startResize(e, hd.dir)}
            aria-hidden
          />
        ))}
    </div>
  )
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

  //true once the box has typed text or an image, drives drag + cursor
  function hasContent() {
    return !!(body.current?.textContent?.trim() || body.current?.querySelector('img'))
  }

  //drag the header to reposition, clamped to the positive canvas. an empty box
  //is not draggable yet, a click just keeps the caret for typing
  function startDrag(e: React.PointerEvent) {
    if (!hasContent()) return
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
    const el = e.currentTarget as HTMLElement
    //first resize of an auto-sized box: start from its current rendered width
    const startW = box.w ?? el.parentElement?.offsetWidth ?? 80
    const start = { px: e.clientX, w: startW }
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
    if (!hasContent()) onRemove()
  }

  return (
    <div
      className="canvas-box group"
      //no stored width: grow with the text up to BOX_MAX_W then wrap. once
      //resized, use the fixed width the user dragged to
      style={
        box.w
          ? { left: box.x, top: box.y, width: box.w }
          : { left: box.x, top: box.y, width: 'max-content', maxWidth: BOX_MAX_W }
      }
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
