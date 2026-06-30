import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDown,
  ArrowDownToLine,
  AlignLeft,
  AlignRight,
  ArrowUp,
  ArrowUpToLine,
 Check,
 ChevronLeft,
 ChevronRight,
 ClipboardPaste,
 Copy,
 Crop,
 EyeOff,
 ImagePlus,
 Link as LinkIcon,
 PanelRightClose,
  PanelRightOpen,
  Presentation,
 RectangleHorizontal,
 Scissors,
 ScrollText,
  StretchVertical,
  Trash2,
} from 'lucide-react'
import { PageEditor, type EditorCan } from '@/components/PageEditor'
import { attachmentUrl, deleteAttachment, readAttachment, writeAttachment } from '@/lib/attachments'
import { importAttachment, importImage, isImage, isPdf } from '@/lib/importFiles'
import { ImportChoiceDialog, type ImportChoice } from '@/components/ImportChoiceDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { File as FileIcon, FileText, Info } from 'lucide-react'
import { validateName } from '@/lib/fs'
import { DEFAULT_DOC_WIDTH, parsePage, rid, serializePage, type BoxMeta } from '@/lib/pageDoc'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

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
  onTitleDraft?: (name: string) => void
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
//default width for a freshly imported pdf window, height derives from the
//first page's aspect. resized freely after, no aspect lock
const DEFAULT_PDF_W = 460
//min size a pdf window can be dragged down to
const MIN_PDF_W = 220
const MIN_PDF_H = 220
//css width of a slideshow thumbnail (height follows the page aspect)
const THUMB_W = 92
//width of the thumbnail rail (matches .canvas-pdf-thumbs in global.css)
const PDF_SIDEBAR_W = 124
//warn before rasterising a pdf with more pages than this
const PRINTOUT_WARN_PAGES = 30
const SCROLL_PAD = 240
//frame padding (.canvas-box-frame), subtracted on create so the caret lands
//on the click point rather than offset by the padding
const BOX_PAD_X = 10
const BOX_PAD_Y = 8
//left pad of the document text column in content coords; the doc-width marker
//(right margin) sits at this + docW, used to right-justify boxes to it
const DOC_LEFT_PAD = 40

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
  onTitleDraft,
  toggleTitleNonce,
  onTitleHiddenChange,
}: Props) {
  const wrapper = useRef<HTMLDivElement>(null)
  //the editor's scrolling content node, where we portal the title and boxes
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null)
  const initial = useRef(parsePage(content))
  //width of the document text column, dragged via the marker at the top of the
  //canvas and fed to the document max-width via the --doc-w css variable
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
  //always save through the latest onSave, never a stale closure: a first import
  //promotes the page to a folder mid-flight, swapping onSave to target the new
  //index.html. an in-flight import that captured the old leaf-bound onSave would
  //otherwise write the box to the now-orphaned leaf file and lose it
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

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
      onSaveRef.current(html)
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  //write any pending changes right now, used before a rename copies the file and
  //on unmount. skip when nothing changed so a plain page switch never rewrites
  //the file (or risks resurrecting one deleted out from under us)
  async function flushSave() {
    window.clearTimeout(saveTimer.current)
    const html = buildHtml()
    if (html === lastSaved.current) return
    lastSaved.current = html
    await onSaveRef.current(html)
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
      .filter(
        (b) =>
          (b.kind === 'image' || b.kind === 'attachment' || b.kind === 'pdf') &&
          b.file,
      )
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

  //undo/redo for canvas boxes. a delete entry holds the removed box (and its
  //text html) so it can be restored; a geom entry holds the box's geometry
  //before and after a move/resize/crop so it can be rolled either way. a media
  //file is only erased from disk once its deletion drops off the undo history,
  //so undo can always bring the box (and its image) back
type UndoAction =
  | { type: 'delete'; box: BoxMeta; html?: string }
  | { type: 'deleteMany'; boxes: BoxMeta[]; html?: Record<string, string> }
  | { type: 'add'; boxes: BoxMeta[]; html?: Record<string, string> }
  | { type: 'geom'; id: string; before: Partial<BoxMeta>; after: Partial<BoxMeta> }
    //a stacking change: the box moved from one index in the paint order to another
    | { type: 'order'; id: string; from: number; to: number }
  const undoStack = useRef<UndoAction[]>([])
  const redoStack = useRef<UndoAction[]>([])
  const UNDO_CAP = 50
  //latest pageDir for the finalizer, which may run from a once-bound listener
  const pageDirRef = useRef(pageDir)
  pageDirRef.current = pageDir

  //the live document editor, polled to learn whether the document still has its
  //own undo/redo, so the toolbar buttons reflect doc + canvas availability
  const editorCan = useRef<EditorCan | null>(null)

  //a deletion is now permanent: drop the box's text and, if no remaining box
  //still uses its file, revoke the url and erase the file from attachments. only
  //delete entries touch disk, geom entries leave nothing to clean up
function finalizeDelete(action: UndoAction) {
  const removed =
    action.type === 'delete'
      ? [action.box]
      : action.type === 'deleteMany' || action.type === 'add'
        ? action.boxes
        : []
  for (const box of removed) {
    delete boxHtml.current[box.id]
    const file = box.file
    if (!file || boxesRef.current.some((b) => b.file === file)) continue
    const url = mediaUrls.current.get(file)
    if (url) {
      URL.revokeObjectURL(url)
      mediaUrls.current.delete(file)
    }
    if (pageDirRef.current) void deleteAttachment(pageDirRef.current, file)
  }
}

  //push an action and clear redo, evicting (and finalizing) the oldest past the cap
function pushUndo(action: UndoAction) {
  undoStack.current.push(action)
  redoStack.current.forEach(finalizeDelete)
  redoStack.current = []
    while (undoStack.current.length > UNDO_CAP) {
      finalizeDelete(undoStack.current.shift()!)
    }
    syncUndoButtons()
  }

  //geometry fields an undo entry rolls back, snapshotted before/after a gesture
  const GEOM_KEYS = ['x', 'y', 'w', 'h', 'crop', 'radius'] as const
  function snapshotGeom(id: string): Partial<BoxMeta> {
    const b = boxesRef.current.find((x) => x.id === id)
    const s: Partial<BoxMeta> = {}
    if (b) for (const k of GEOM_KEYS) (s as Record<string, unknown>)[k] = b[k]
    return s
  }
  //the geometry captured when a move/resize/crop gesture (or image menu) began,
  //committed as one undo entry on release so a drag is a single undo step
  const geomBefore = useRef<{ id: string; before: Partial<BoxMeta> } | null>(null)
  function beginGeom(id: string) {
    geomBefore.current = { id, before: snapshotGeom(id) }
  }
  function commitGeom(id: string) {
    const pending = geomBefore.current
    geomBefore.current = null
    if (!pending || pending.id !== id) return
    //the box was deleted during the session (its own undo entry covers that)
    if (!boxesRef.current.some((b) => b.id === id)) return
    const after = snapshotGeom(id)
    //nothing actually moved, skip the empty entry
    if (GEOM_KEYS.every((k) => pending.before[k] === after[k])) return
    pushUndo({ type: 'geom', id, before: pending.before, after })
  }

  //the editor only toggles its toolbar undo/redo from document history, so
  //it can't see canvas edits (resize, delete). drive each button from the true
  //combined state: enabled when either our stack or the document has something
  //to roll, disabled (and greyed) otherwise. computed from ground truth so a
  //write only happens when the value actually differs, no flicker, no loop
  function buttonDisabled(canEditor: boolean, canCanvas: boolean) {
    return !(canCanvas || canEditor)
  }
  function syncUndoButtons() {
    const el = wrapper.current
    if (!el) return
    const u = el.querySelector('.lucide-undo2')?.closest('button') as HTMLButtonElement | null
    const r = el.querySelector('.lucide-redo2')?.closest('button') as HTMLButtonElement | null
    //the editor view may be torn down mid page-switch, can() throws then
    let canUndo = false
    let canRedo = false
    try {
      const ed = editorCan.current
      canUndo = !!ed?.can().undo()
      canRedo = !!ed?.can().redo()
    } catch {
      // editor gone, fall back to canvas-only availability
    }
    if (u) {
      const want = buttonDisabled(canUndo, undoStack.current.length > 0)
      if (u.disabled !== want) u.disabled = want
    }
    if (r) {
      const want = buttonDisabled(canRedo, redoStack.current.length > 0)
      if (r.disabled !== want) r.disabled = want
    }
  }

  //on unmount, every still-pending deletion becomes permanent (the page is
  //closing, there is no longer anything to undo into), then revoke remaining urls
  useEffect(
    () => () => {
      //flush any debounced edit now (page-bound onSave writes the right file)
      //instead of leaving a timer to fire after this instance is gone
      void flushSave()
      undoStack.current.forEach(finalizeDelete)
      mediaUrls.current.forEach((u) => URL.revokeObjectURL(u))
      mediaUrls.current.clear()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  //canvas) in capture phase, before the editor or a contentEditable can embed
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

  //undo/redo box deletions with the usual shortcuts. listens on the window so it
  //fires wherever focus landed after a delete. a pending box deletion takes
  //precedence over the editor's own undo (you just deleted something, bring it
  //back first); once the stack drains the editor undoes normally again. form
  //fields (dialog inputs) keep their native undo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      const t = e.target as HTMLElement
      if (t.closest?.('input, textarea')) return
      const redo = key === 'y' || (key === 'z' && e.shiftKey)
      if (redo) {
        if (redoStack.current.length) {
          e.preventDefault()
          redoRef.current()
        }
      } else if (undoStack.current.length) {
        e.preventDefault()
        undoRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  //route the editor toolbar's undo/redo arrow buttons through the canvas stack.
  //caught in capture so a pending canvas action runs and the editor's own undo
  //is suppressed (stopPropagation keeps the click from reaching editor's
  //handler); once our stack drains the click falls through to the editor as
  //normal. the buttons are matched by their lucide undo/redo icon
  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    function onClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest?.('button')
      if (!btn || !el!.contains(btn)) return
      const isRedo = btn.querySelector('.lucide-redo2')
      const isUndo = btn.querySelector('.lucide-undo2')
      if (!isUndo && !isRedo) return
      if (isRedo) {
        if (!redoStack.current.length) return
      } else if (!undoStack.current.length) return
      e.preventDefault()
      e.stopPropagation()
      ;(isRedo ? redoRef : undoRef).current()
    }
    el.addEventListener('click', onClick, true)
    //the editor disables buttons when document has no history, and may
    //re-disable them on its own re-renders. re-enable them whenever canvas
    //stack still has something to roll
    const obs = new MutationObserver(() => syncUndoButtons())
    obs.observe(el, { childList: true, subtree: true, attributeFilter: ['disabled'] })
    return () => {
      el.removeEventListener('click', onClick, true)
      obs.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  //mousedown on the blank canvas (not the document, not a box) creates a text
  //box, mousedown preventDefault keeps focus off the editor so the box keeps it
  useEffect(() => {
    if (!contentEl) return
    function onDown(e: MouseEvent) {
      if (e.button !== 0) return
      const t = e.target as HTMLElement
      if (
        t.closest('.ql-editor') ||
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

  //live geometry update, keep the ref in sync so a commit right after a gesture
  //reads the final geometry. does not record undo, the gesture's begin/commit
  //pair does that once on release
function updateBox(id: string, patch: Partial<BoxMeta>) {
  boxesRef.current = boxesRef.current.map((b) => (b.id === id ? { ...b, ...patch } : b))
  setBoxes(boxesRef.current)
  scheduleSave()
}

function addBoxes(newBoxes: BoxMeta[], html?: Record<string, string>) {
  if (!newBoxes.length) return
  if (html) Object.assign(boxHtml.current, html)
  boxesRef.current = [...boxesRef.current, ...newBoxes]
  setBoxes(boxesRef.current)
  pushUndo({ type: 'add', boxes: newBoxes.map((b) => ({ ...b })), html })
  scheduleSave()
}

function removeBoxes(ids: string[]) {
  const dead = new Set(ids)
  boxesRef.current = boxesRef.current.filter((b) => !dead.has(b.id))
  setBoxes(boxesRef.current)
}

  //pin a box left/right (or unpin with null). justifying left also parks its
  //stored x at 0 so unjustifying leaves it there rather than jumping back
  //set/clear a box's horizontal pin. justifying left parks x at the text margin;
  //unjustifying keeps the box where it currently sits (the caller measures and
  //passes that x) instead of snapping back to its old free position
  function justifyBox(id: string, j: 'left' | 'right' | null, x?: number) {
    const xPatch =
      j === 'left' ? { x: DOC_LEFT_PAD } : x !== undefined ? { x } : {}
    updateBox(id, { justify: j ?? undefined, ...xPatch })
  }

  //the content x a right-justified box's right edge pins to: the doc-width
  //marker. a translateX(-100%) on the box turns this into its left edge.
  //left-justified boxes sit at the same left margin as the title/text column
  const rightEdgeX = docW + DOC_LEFT_PAD
  //the box passed to a renderer with its justified horizontal position applied
  function placed(b: BoxMeta): BoxMeta {
    if (b.justify === 'left') return { ...b, x: DOC_LEFT_PAD }
    if (b.justify === 'right') return { ...b, x: rightEdgeX }
    return b
  }
  //drop the x from a drag/resize patch when the box is horizontally pinned, so
  //it can still move vertically (and resize) without breaking the justify
  function patchBox(b: BoxMeta, patch: Partial<BoxMeta>) {
    if (b.justify) {
      //a move (x/y, no size change) frees the box; a resize keeps it pinned
      const isMove =
        (patch.x !== undefined || patch.y !== undefined) &&
        patch.w === undefined &&
        patch.h === undefined
      if (isMove) {
        updateBox(b.id, { ...patch, justify: undefined })
      } else {
        const rest = { ...patch }
        delete rest.x
        updateBox(b.id, rest)
      }
    } else {
      updateBox(b.id, patch)
    }
  }

  function removeBox(id: string) {
    const box = boxesRef.current.find((b) => b.id === id)
    if (!box) return
    //record the deletion for undo, keep the file and url around in case it comes
    //back. pushUndo evicts the oldest action past the cap and makes it permanent
    pushUndo({ type: 'delete', box: { ...box }, html: boxHtml.current[id] })
  removeBoxes([id])
    scheduleSave()
  }

  //move a box to a new index in the paint order, keeping the ref in sync
  function applyMove(id: string, index: number) {
    const arr = boxesRef.current.slice()
    const i = arr.findIndex((b) => b.id === id)
    if (i < 0) return
    const [box] = arr.splice(i, 1)
    arr.splice(index, 0, box)
    boxesRef.current = arr
    setBoxes(arr)
  }

  //change a box's stacking: later in the array paints on top (the boxes share one
  //overlay with no per-box z-index, so array order is paint order)
  function reorderBox(id: string, dir: 'front' | 'back' | 'forward' | 'backward') {
    const arr = boxesRef.current
    const i = arr.findIndex((b) => b.id === id)
    if (i < 0) return
    const to =
      dir === 'front'
        ? arr.length - 1
        : dir === 'back'
          ? 0
          : dir === 'forward'
            ? Math.min(arr.length - 1, i + 1)
            : Math.max(0, i - 1)
    if (to === i) return
    applyMove(id, to)
    pushUndo({ type: 'order', id, from: i, to })
    scheduleSave()
  }

  //roll the most recent action back: re-add a deleted box, restore the
  //pre-gesture geometry of a moved/resized one, or undo a stacking change
  function undo() {
    const action = undoStack.current.pop()
    if (!action) return
  if (action.type === 'delete') {
    if (action.html !== undefined) boxHtml.current[action.box.id] = action.html
    boxesRef.current = [...boxesRef.current, action.box]
    setBoxes(boxesRef.current)
  } else if (action.type === 'deleteMany') {
    if (action.html) {
      for (const [id, html] of Object.entries(action.html)) boxHtml.current[id] = html
    }
    boxesRef.current = [...boxesRef.current, ...action.boxes]
    setBoxes(boxesRef.current)
  } else if (action.type === 'add') {
    removeBoxes(action.boxes.map((b) => b.id))
  } else if (action.type === 'order') {
    applyMove(action.id, action.from)
  } else {
      updateBox(action.id, action.before)
    }
    redoStack.current.push(action)
    syncUndoButtons()
    scheduleSave()
  }

  //re-apply the most recently undone action
  function redo() {
    const action = redoStack.current.pop()
    if (!action) return
  if (action.type === 'delete') {
    removeBoxes([action.box.id])
  } else if (action.type === 'deleteMany') {
    removeBoxes(action.boxes.map((b) => b.id))
  } else if (action.type === 'add') {
    if (action.html) {
      for (const [id, html] of Object.entries(action.html)) boxHtml.current[id] = html
    }
    boxesRef.current = [...boxesRef.current, ...action.boxes]
    setBoxes(boxesRef.current)
  } else if (action.type === 'order') {
    applyMove(action.id, action.to)
  } else {
      updateBox(action.id, action.after)
    }
    undoStack.current.push(action)
    syncUndoButtons()
    scheduleSave()
  }
  //keep the once-bound key/click listeners pointed at the latest closures
  const undoRef = useRef(undo)
  undoRef.current = undo
  const redoRef = useRef(redo)
  redoRef.current = redo

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

function escapeHtml(text: string) {
 return text
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
}

function textToHtml(text: string) {
 return escapeHtml(text)
  .split(/\r?\n/)
  .map((line) => line || '<br>')
  .join('<br>')
}

function addTextBox(html: string, x: number, y: number) {
 const box: BoxMeta = { id: rid(), x: Math.max(0, x), y: Math.max(0, y), html }
 addBoxes([box], { [box.id]: html })
 setFocusId(box.id)
}

  //a pending attachment/printout prompt for the current non-image file
  const [pending, setPending] = useState<{ name: string; canPrintout: boolean } | null>(null)
  const choiceResolver = useRef<((c: ImportChoice | null) => void) | null>(null)
  const [printoutConfirm, setPrintoutConfirm] = useState<{
    pages: number
    resolve: (ok: boolean) => void
  } | null>(null)

  //open the prompt and resolve once the user picks (or dismisses)
  function askImportChoice(name: string, canPrintout: boolean): Promise<ImportChoice | null> {
    return new Promise((resolve) => {
      choiceResolver.current = resolve
      setPending({ name, canPrintout })
    })
  }
  function resolveChoice(choice: ImportChoice | null) {
    setPending(null)
    choiceResolver.current?.(choice)
    choiceResolver.current = null
  }

  function confirmLargePrintout(pages: number): Promise<boolean> {
    if (pages <= PRINTOUT_WARN_PAGES) return Promise.resolve(true)
    return new Promise((resolve) => setPrintoutConfirm({ pages, resolve }))
  }

  function resolvePrintoutConfirm(ok: boolean) {
    printoutConfirm?.resolve(ok)
    setPrintoutConfirm(null)
  }

  //import dropped or picked files onto the canvas. images insert silently as
  //image boxes; other files prompt for attachment vs printout. multiple files
  //stack with a small offset
  async function importFiles(files: FileList | File[], x: number, y: number) {
    const list = Array.from(files)
    if (!list.length) return
    //first import promotes a leaf page to a folder so it can hold attachments
    const dir = pageDir ?? (await ensurePageDir())
    if (!dir) return
    let offset = 0
    for (const file of list) {
      const px = Math.max(0, x + offset)
      const py = Math.max(0, y + offset)
      if (isImage(file)) {
        const box = await importImage(dir, file, px, py)
        addBoxes([box])
        offset += 24
        continue
      }
      const choice = await askImportChoice(file.name, isPdf(file.type, file.name))
      if (!choice) continue
      if (choice === 'printout' && isPdf(file.type, file.name)) {
        //pass the file so the printout also drops the original as an attachment
        //pill centered above its first page
        const pages = await buildPrintoutBoxes(dir, stripExt(file.name), await file.arrayBuffer(), px, py, file)
        addBoxes(pages)
        offset += 24
        continue
      }
      if (choice === 'pdfwindow' && isPdf(file.type, file.name)) {
        const box = await buildPdfWindowBox(dir, file, px, py)
        addBoxes([box])
        offset += 24
        continue
      }
      //attachment, or printout fallback for non-pdf files (TODO: docx -> images)
      const box = await importAttachment(dir, file, px, py)
      addBoxes([box])
      offset += 24
    }
  }

  //rasterise a pdf into stacked image boxes, each page stored as a png so the
  //notebook stays self-contained
  async function buildPrintoutBoxes(
    dir: FileSystemDirectoryHandle,
    baseName: string,
    data: ArrayBuffer,
    x: number,
    y: number,
    //when given, the original file is stored and an attachment pill is dropped
    //centered above the first page
    attachFile?: File,
  ): Promise<BoxMeta[]> {
    //load the pdf renderer on demand so the heavy library stays out of the
    //initial bundle
    const { rasterizePdf } = await import('@/lib/pdfPrintout')
    //confirm before rasterising very long pdfs, each page becomes a stored png
    const pages = await rasterizePdf(data, confirmLargePrintout)
    if (!pages.length) return []
    const out: BoxMeta[] = []
    let yy = y
    if (attachFile) {
      const stored = await writeAttachment(dir, attachFile, attachFile.name)
      //estimate the pill width to roughly center it over the page column
      const pillW = 200
      out.push({
        id: rid(),
        html: '',
        x: Math.max(0, x + DEFAULT_IMG_W / 2 - pillW / 2),
        y: yy,
        kind: 'attachment',
        file: stored,
        mime: attachFile.type,
        name: attachFile.name,
      })
      yy += 44
    }
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]
      const stored = await writeAttachment(dir, p.blob, `${baseName}-p${i + 1}.png`)
      const h = Math.round(DEFAULT_IMG_W / p.aspect)
      out.push({
        id: rid(),
        html: '',
        x,
        y: yy,
        w: DEFAULT_IMG_W,
        h,
        kind: 'image',
        file: stored,
        mime: 'image/png',
        name: `${baseName} p${i + 1}`,
        aspect: p.aspect,
      })
      yy += h + 16
    }
    return out
  }

  //store a pdf and build a resizable window box that scrolls it inline. sized
  //page-shaped from the first page's aspect, then resized freely by the user
  async function buildPdfWindowBox(
    dir: FileSystemDirectoryHandle,
    file: File,
    x: number,
    y: number,
  ): Promise<BoxMeta> {
    const { firstPageAspect } = await import('@/lib/pdfPrintout')
    const aspect = await firstPageAspect(await file.arrayBuffer())
    const stored = await writeAttachment(dir, file, file.name)
    return {
      id: rid(),
      html: '',
      x,
      y,
      w: DEFAULT_PDF_W,
      h: Math.round(DEFAULT_PDF_W / aspect),
      kind: 'pdf',
      file: stored,
      mime: file.type,
      name: file.name,
      //first page ratio, lets "fit one page" snap without re-reading the pdf
      aspect,
    }
  }

  //right-click an attachment pill -> lay its pdf pages out as images below it
  async function insertPrintout(box: BoxMeta) {
    const dir = pageDir ?? (await ensurePageDir())
    if (!dir || !box.file) return
    const file = await readAttachment(dir, box.file)
    if (!file) return
    const pillW = 200
    updateBox(box.id, {
      x: Math.max(0, box.x + DEFAULT_IMG_W / 2 - pillW / 2),
      y: box.y,
    })
    const pages = await buildPrintoutBoxes(
      dir,
      stripExt(box.name ?? 'page'),
      await file.arrayBuffer(),
      box.x,
      box.y + 44,
    )
    addBoxes(pages)
  }

  async function insertPdfWindow(box: BoxMeta) {
    const dir = pageDir ?? (await ensurePageDir())
    if (!dir || !box.file) return
    const file = await readAttachment(dir, box.file)
    if (!file) return
    const pdf = await buildPdfWindowBox(dir, file, box.x, box.y + 44)
    addBoxes([pdf])
  }

  function deletePrintoutImages(box: BoxMeta) {
    const base = stripExt(box.name ?? box.file ?? '')
    if (!base) return
    const victims = boxesRef.current.filter(
      (b) => b.kind === 'image' && (b.name ?? '').startsWith(`${base} p`),
    )
    if (!victims.length) return
    pushUndo({ type: 'deleteMany', boxes: victims.map((b) => ({ ...b })) })
    removeBoxes(victims.map((b) => b.id))
    scheduleSave()
  }

  const [canvasMenu, setCanvasMenu] = useState<{
    x: number
    y: number
    canvasX: number
    canvasY: number
  } | null>(null)
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

  function onCanvasContextMenu(e: React.MouseEvent) {
    if (e.defaultPrevented) return
    e.preventDefault()
    const { x, y } = contentPoint(e.clientX, e.clientY)
    setCanvasMenu({ x: e.clientX, y: e.clientY, canvasX: Math.max(0, x), canvasY: Math.max(0, y) })
  }

  async function pasteClipboardImages(menu: { canvasX: number; canvasY: number }) {
    setCanvasMenu(null)
    const read = navigator.clipboard?.read
    if (!read) return
    try {
      const items = await read.call(navigator.clipboard)
      const files: File[] = []
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        const ext = type.split('/')[1] || 'png'
        files.push(new File([blob], `clipboard-image-${Date.now()}.${ext}`, { type }))
      }
      if (files.length) await importFiles(files, menu.canvasX, menu.canvasY)
    } catch {
      //clipboard permission denied or unsupported; keep native popup out of this flow
    }
  }

function copySelection() {
    setCanvasMenu(null)
    document.execCommand('copy')
  }

  function cutSelection() {
    setCanvasMenu(null)
    document.execCommand('cut')
  }

  async function pasteClipboard(menu: { canvasX: number; canvasY: number }) {
    void pasteClipboardImages
    setCanvasMenu(null)
    try {
      const read = navigator.clipboard?.read
      if (read) {
        const items = await read.call(navigator.clipboard)
        const files: File[] = []
        let html = ''
        let text = ''

        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'))
          if (imageType) {
            const blob = await item.getType(imageType)
            const ext = imageType.split('/')[1] || 'png'
            files.push(new File([blob], `clipboard-image-${Date.now()}.${ext}`, { type: imageType }))
            continue
          }
          if (!html && item.types.includes('text/html')) {
            html = await (await item.getType('text/html')).text()
          }
          if (!text && item.types.includes('text/plain')) {
            text = await (await item.getType('text/plain')).text()
          }
        }

        if (files.length) {
          await importFiles(files, menu.canvasX, menu.canvasY)
          return
        }
        const content = html || (text ? textToHtml(text) : '')
        if (content) addTextBox(content, menu.canvasX, menu.canvasY)
        return
      }

      const text = await navigator.clipboard?.readText?.()
      if (text) addTextBox(textToHtml(text), menu.canvasX, menu.canvasY)
    } catch {
      //clipboard permission denied or unsupported; keep native popup out this flow
    }
  }

  function insertLink(menu: { canvasX: number; canvasY: number }) {
    setCanvasMenu(null)
    const raw = window.prompt('Link URL')
    if (!raw) return
    const url = raw.trim()
    if (!url) return
    const label = window.prompt('Link text', url)?.trim() || url
    addTextBox(
      `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`,
      menu.canvasX,
      menu.canvasY,
    )
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
  onTitleDraft?.(pageName)
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
      b.kind === 'image'
        ? (b.h ?? (b.aspect ? w / b.aspect : w))
        : b.kind === 'pdf'
          ? (b.h ?? DEFAULT_PDF_W)
          : 80
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
      onContextMenu={onCanvasContextMenu}
    >
      <PageEditor key={pageKey} content={docHtml.current} onSave={onDocChange} editorOut={editorCan} />

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
            onInput={(e) => onTitleDraft?.((e.currentTarget.textContent ?? '').trim())}
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
              //the document editor layer sits below the freeform box overlay
              //overlay above it or the editor paints over boxes and eats hits
              className="pointer-events-none absolute left-0 top-0 z-10"
              style={{ width: extent.w || undefined, height: extent.h || undefined }}
            >
              {boxes.map((b) =>
                b.kind === 'pdf' ? (
                  <PdfBox
                    key={b.id}
                    box={placed(b)}
                    url={b.file ? mediaUrls.current.get(b.file) : undefined}
                    onGeom={(patch) => patchBox(b, patch)}
                    onGeomBegin={() => beginGeom(b.id)}
                    onGeomCommit={() => commitGeom(b.id)}
                    onReorder={(d) => reorderBox(b.id, d)}
                    onJustify={(j, x) => justifyBox(b.id, j, x)}
                    onRemove={() => removeBox(b.id)}
                  />
                ) : b.kind === 'image' ? (
                  <ImageBox
                    key={b.id}
                    box={placed(b)}
                    url={b.file ? mediaUrls.current.get(b.file) : undefined}
                    onGeom={(patch) => patchBox(b, patch)}
                    onGeomBegin={() => beginGeom(b.id)}
                    onGeomCommit={() => commitGeom(b.id)}
                    onReorder={(d) => reorderBox(b.id, d)}
                    onJustify={(j, x) => justifyBox(b.id, j, x)}
                    onRemove={() => removeBox(b.id)}
                  />
                ) : b.kind === 'attachment' ? (
                  <AttachmentBox
                    key={b.id}
                    box={placed(b)}
                    url={b.file ? mediaUrls.current.get(b.file) : undefined}
                    onMove={(x, y) => patchBox(b, { x, y })}
                    onGeomBegin={() => beginGeom(b.id)}
                    onGeomCommit={() => commitGeom(b.id)}
                    onReorder={(d) => reorderBox(b.id, d)}
                    onJustify={(j, x) => justifyBox(b.id, j, x)}
                    onRemove={() => removeBox(b.id)}
          onInsertPrintout={
            isPdf(b.mime, b.name) ? () => insertPrintout(b) : undefined
          }
          onInsertPdfWindow={
            isPdf(b.mime, b.name) ? () => insertPdfWindow(b) : undefined
          }
          onDeletePrintoutImages={
            isPdf(b.mime, b.name) ? () => deletePrintoutImages(b) : undefined
          }
        />
                ) : (
                  <Box
                    key={b.id}
                    box={placed(b)}
                    autoFocus={b.id === focusId}
                    initialHtml={boxHtml.current[b.id] ?? b.html}
                    onInput={(html) => onBoxInput(b.id, html)}
                    onMove={(x, y) => patchBox(b, { x, y })}
                    onResize={(w) => updateBox(b.id, { w })}
                    onGeomBegin={() => beginGeom(b.id)}
                    onGeomCommit={() => commitGeom(b.id)}
                    onReorder={(d) => reorderBox(b.id, d)}
                    onJustify={(j, x) => justifyBox(b.id, j, x)}
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

      {canvasMenu && (
        <CanvasMenu
          menu={canvasMenu}
          onClose={() => setCanvasMenu(null)}
          onCopy={copySelection}
          onCut={cutSelection}
          onPaste={() => pasteClipboard(canvasMenu)}
          onInsertLink={() => insertLink(canvasMenu)}
        />
      )}

      <ImportChoiceDialog
        fileName={pending?.name ?? null}
        canPrintout={pending?.canPrintout ?? false}
        onChoose={resolveChoice}
      />

      <Dialog open={!!printoutConfirm} onOpenChange={(open) => !open && resolvePrintoutConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Large PDF printout</DialogTitle>
            <DialogDescription>
              This PDF has {printoutConfirm?.pages ?? 0} pages. Laying them out will create{' '}
              {printoutConfirm?.pages ?? 0} images and may be slow.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => resolvePrintoutConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={() => resolvePrintoutConfirm(true)}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function CanvasMenu({
  menu,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onInsertLink,
}: {
  menu: { x: number; y: number }
  onClose: () => void
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onInsertLink: () => void
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
      className="fixed z-50 min-w-44 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button role="menuitem" onClick={onCopy} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none hover:bg-accent">
        <Copy className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Copy
      </button>
      <button role="menuitem" onClick={onCut} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none hover:bg-accent">
        <Scissors className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Cut
      </button>
      <button role="menuitem" onClick={onPaste} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none hover:bg-accent">
        <ClipboardPaste className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Paste
      </button>
      <div className="my-1 border-t border-border" />
      <button role="menuitem" onClick={onInsertLink} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none hover:bg-accent">
        <LinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Insert link
      </button>
    </div>
  )
}

//horizontal pin direction, null clears it
type JustifyDir = 'left' | 'right'

//the content-x a justified box currently sits at, so unjustifying can leave it
//in place. offsetLeft is the laid-out left (the placed anchor); a right-pinned
//box is shifted left by its own width via translateX(-100%), so subtract that
function justifiedX(el: HTMLElement | null, justify?: JustifyDir): number | undefined {
  if (!el) return undefined
  return justify === 'right' ? el.offsetLeft - el.offsetWidth : el.offsetLeft
}

//the left a body drag should start from. a right-justified box is placed at the
//marker anchor but drawn its own width to the left (translateX(-100%)); starting
//from that visual left means a move (which unjustifies it) doesn't jump
function dragStartX(box: BoxMeta, el: HTMLElement | null): number {
  return box.justify === 'right' ? box.x - (el?.offsetWidth ?? 0) : box.x
}

//justify controls rendered as list rows, shared by every box's right-click menu.
//the active direction reads "Unjustify", the other offers to switch to it
function JustifyActions({
  justify,
  onJustify,
  onClose,
}: {
  justify?: JustifyDir
  onJustify: (j: JustifyDir | null) => void
  onClose: () => void
}) {
  const item = 'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none hover:bg-accent'
  const rows: { dir: JustifyDir; label: string; Icon: typeof AlignLeft }[] = [
    { dir: 'left', label: 'Justify left', Icon: AlignLeft },
    { dir: 'right', label: 'Justify right', Icon: AlignRight },
  ]
  return (
    <>
      {rows.map(({ dir, label, Icon }) => (
        <button
          key={dir}
          role="menuitem"
          className={item}
          onClick={() => {
            onJustify(justify === dir ? null : dir)
            onClose()
          }}
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {justify === dir ? `Unjustify ${dir}` : label}
          {justify === dir && <Check className="ml-auto size-4 shrink-0" aria-hidden />}
        </button>
      ))}
    </>
  )
}

//the four stacking moves every box's right-click menu offers
type ReorderDir = 'front' | 'back' | 'forward' | 'backward'
const LAYER_ACTIONS: { dir: ReorderDir; label: string; Icon: typeof ArrowUp }[] = [
  { dir: 'front', label: 'Bring to front', Icon: ArrowUpToLine },
  { dir: 'forward', label: 'Bring forward', Icon: ArrowUp },
  { dir: 'backward', label: 'Send backward', Icon: ArrowDown },
  { dir: 'back', label: 'Send to back', Icon: ArrowDownToLine },
]

//stacking controls rendered as list rows, shared by the attachment and text-box
//right-click menus
function LayerActions({
  onReorder,
  onClose,
}: {
  onReorder: (d: ReorderDir) => void
  onClose: () => void
}) {
  const item = 'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none hover:bg-accent'
  return (
    <>
      {LAYER_ACTIONS.map(({ dir, label, Icon }) => (
        <button
          key={dir}
          role="menuitem"
          className={item}
          onClick={() => {
            onReorder(dir)
            onClose()
          }}
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {label}
        </button>
      ))}
    </>
  )
}

interface BoxProps {
  box: BoxMeta
  autoFocus: boolean
  initialHtml: string
  onInput: (html: string) => void
  onMove: (x: number, y: number) => void
  onResize: (w: number) => void
  //bracket a move/resize gesture so it lands as a single undo step
  onGeomBegin: () => void
  onGeomCommit: () => void
  onReorder: (d: ReorderDir) => void
  onJustify: (j: JustifyDir | null, x?: number) => void
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
  onGeomBegin,
  onGeomCommit,
  onReorder,
  onJustify,
  onRemove,
}: {
  box: BoxMeta
  url?: string
  onGeom: (patch: Partial<BoxMeta>) => void
  //bracket a move/resize/crop gesture (or a menu edit session) so it lands as a
  //single undo step
  onGeomBegin: () => void
  onGeomCommit: () => void
  onReorder: (d: ReorderDir) => void
  onJustify: (j: JustifyDir | null, x?: number) => void
  onRemove: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(false)
  //right-click menu position, null when closed
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  //true while the crop tool is open over this image
  const [cropping, setCropping] = useState(false)
  const w = box.w ?? DEFAULT_IMG_W
  const h = box.h ?? (box.aspect ? w / box.aspect : w)

  //image styling. with a crop, scale the whole image up so the visible crop
  //region exactly fills the box, then offset it; the frame's overflow clips it
  const imgStyle: CSSProperties = box.crop
    ? {
        display: 'block',
        position: 'absolute',
        width: w / box.crop.w,
        height: h / box.crop.h,
        left: -box.crop.x * (w / box.crop.w),
        top: -box.crop.y * (h / box.crop.h),
        maxWidth: 'none',
        objectFit: 'fill',
      }
    : { display: 'block', width: '100%', height: '100%', objectFit: 'fill', maxWidth: 'none' }

  //full uncropped display size used while cropping, matches the current scale
  const fullW = box.crop ? w / box.crop.w : w
  const fullH = box.crop ? h / box.crop.h : box.aspect ? w / box.aspect : h

  //drag the body to reposition, clamped to the positive canvas
  function startDrag(e: React.PointerEvent) {
    e.preventDefault()
    ref.current?.focus()
    onGeomBegin()
    const start = { px: e.clientX, py: e.clientY, x: dragStartX(box, ref.current), y: box.y }
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
      onGeomCommit()
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
    onGeomBegin()
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
      onGeomCommit()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  //crop tool: show the full uncropped image with a draggable selection over it
  if (cropping && url) {
    return (
      <div
        className="canvas-box canvas-image is-cropping"
        style={{
          left: box.x,
          top: box.y,
          width: fullW,
          height: fullH,
          transform: box.justify === 'right' ? 'translateX(-100%)' : undefined,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <img
          src={url}
          alt=""
          draggable={false}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'fill', maxWidth: 'none' }}
        />
        <CropOverlay
          fullW={fullW}
          fullH={fullH}
          initial={
            box.crop
              ? {
                  x: box.crop.x * fullW,
                  y: box.crop.y * fullH,
                  w: box.crop.w * fullW,
                  h: box.crop.h * fullH,
                }
              : { x: 0, y: 0, w: fullW, h: fullH }
          }
          onCancel={() => setCropping(false)}
          onConfirm={(r) => {
            //one undo step for the whole crop: snapshot, apply, commit
            onGeomBegin()
            onGeom({
              crop: { x: r.x / fullW, y: r.y / fullH, w: r.w / fullW, h: r.h / fullH },
              w: Math.round(r.w),
              h: Math.round(r.h),
            })
            onGeomCommit()
            setCropping(false)
          }}
        />
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={`canvas-box canvas-image${selected ? ' is-selected' : ''}`}
      style={{
        left: box.x,
        top: box.y,
        width: w,
        height: h,
        transform: box.justify === 'right' ? 'translateX(-100%)' : undefined,
      }}
      tabIndex={0}
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={() => setSelected(true)}
      onBlur={() => setSelected(false)}
      onContextMenu={(e) => {
        e.preventDefault()
        ref.current?.focus()
        //snapshot geometry so all edits made from the menu collapse into one
        //undo step, committed when the menu closes
        onGeomBegin()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          onRemove()
        } else if (e.key === 'Escape') {
          //escape deselects the image
          e.preventDefault()
          ref.current?.blur()
        }
      }}
    >
      <div
        className="canvas-image-frame"
        style={{ borderRadius: box.radius || undefined }}
        onPointerDown={startDrag}
      >
        {url ? (
          //inline sizing so the editor's own .rte-content img rules (this box is
          //portaled into the editor) can't override it back to aspect height
          <img src={url} alt={box.name ?? ''} draggable={false} style={imgStyle} />
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

      {menu && (
        <ImageMenu
          menu={menu}
          w={Math.round(w)}
          h={Math.round(h)}
          radius={Math.round(box.radius ?? 0)}
          aspect={box.aspect}
          cropped={!!box.crop}
          onClose={() => {
            setMenu(null)
            //commit whatever the menu edited as a single undo step
            onGeomCommit()
          }}
          onGeom={onGeom}
          onReorder={onReorder}
          justify={box.justify}
          onJustify={(j) => onJustify(j, j === null ? justifiedX(ref.current, box.justify) : undefined)}
          onRemove={onRemove}
          onCrop={() => {
            //close the menu session (commit its edits) before the crop, which
            //records its own undo step on confirm
            onGeomCommit()
            setMenu(null)
            setCropping(true)
          }}
          onResetCrop={() => onGeom({ crop: undefined, w: Math.round(fullW), h: Math.round(fullH) })}
        />
      )}
    </div>
  )
}

//right-click menu for an image: type exact dimensions, snap to an aspect ratio,
//or round the corners. crop is a planned follow-up
function ImageMenu({
  menu,
  w,
  h,
  radius,
  aspect,
  cropped,
  onClose,
  onGeom,
  onReorder,
  justify,
  onJustify,
  onRemove,
  onCrop,
  onResetCrop,
}: {
  menu: { x: number; y: number }
  w: number
  h: number
  radius: number
  aspect?: number
  cropped: boolean
  onClose: () => void
  onGeom: (patch: Partial<BoxMeta>) => void
  onReorder: (d: ReorderDir) => void
  justify?: JustifyDir
  onJustify: (j: JustifyDir | null) => void
  onRemove: () => void
  onCrop: () => void
  onResetCrop: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onClose)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onClose)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  //apply a target width/height ratio, keeping the current width
  function setRatio(ratio: number) {
    onGeom({ w, h: Math.round(w / ratio) })
  }

  //portal to body so a transformed (right-justified) box ancestor doesn't
  //become the containing block for this fixed menu and throw its position off
  return createPortal(
    <div
      role="menu"
      className="fixed z-50 w-52 rounded-md border border-border bg-popover p-3 text-sm shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2">
        <label className="flex flex-1 items-center gap-1.5">
          <span className="text-xs text-muted-foreground">W</span>
          <input
            type="number"
            defaultValue={w}
            min={MIN_IMG}
            className="w-full rounded border border-border bg-background px-1.5 py-1 outline-none"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (n >= MIN_IMG) onGeom({ w: n })
            }}
          />
        </label>
        <label className="flex flex-1 items-center gap-1.5">
          <span className="text-xs text-muted-foreground">H</span>
          <input
            type="number"
            defaultValue={h}
            min={MIN_IMG}
            className="w-full rounded border border-border bg-background px-1.5 py-1 outline-none"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (n >= MIN_IMG) onGeom({ h: n })
            }}
          />
        </label>
      </div>

      <div className="mb-1 text-xs text-muted-foreground">Aspect ratio</div>
      <div className="mb-3 flex flex-wrap gap-1">
        {aspect && (
          <button
            onClick={() => setRatio(aspect)}
            className="rounded border border-border px-2 py-0.5 text-xs outline-none hover:bg-accent"
            title="reset to the image's original ratio"
          >
            Original
          </button>
        )}
        {([
          ['1:1', 1],
          ['4:3', 4 / 3],
          ['16:9', 16 / 9],
          ['3:4', 3 / 4],
        ] as const).map(([label, ratio]) => (
          <button
            key={label}
            onClick={() => setRatio(ratio)}
            className="rounded border border-border px-2 py-0.5 text-xs outline-none hover:bg-accent"
          >
            {label}
          </button>
        ))}
      </div>

      <label className="block">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Corner rounding</span>
          <span>{radius}px</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.round(Math.min(w, h) / 2)}
          defaultValue={radius}
          className="w-full"
          onChange={(e) => onGeom({ radius: parseInt(e.target.value, 10) })}
        />
      </label>

      {/*stacking: which boxes paint over which. a row of icon buttons keeps the
         panel compact*/}
      <div className="mb-1 mt-3 text-xs text-muted-foreground">Arrange</div>
      <div className="flex gap-1">
        {LAYER_ACTIONS.map(({ dir, label, Icon }) => (
          <button
            key={dir}
            title={label}
            onClick={() => {
              onReorder(dir)
              onClose()
            }}
            className="flex flex-1 items-center justify-center rounded border border-border px-2 py-1 outline-none hover:bg-accent"
          >
            <Icon className="size-4 shrink-0" aria-hidden />
          </button>
        ))}
      </div>

      {/*horizontal pin: left edge to the canvas, right edge to the doc margin*/}
      <div className="mb-1 mt-3 text-xs text-muted-foreground">Align</div>
      <div className="flex gap-1">
        {([
          { dir: 'left', label: 'Justify left', Icon: AlignLeft },
          { dir: 'right', label: 'Justify right', Icon: AlignRight },
        ] as const).map(({ dir, label, Icon }) => (
          <button
            key={dir}
            title={justify === dir ? `Unjustify ${dir}` : label}
            onClick={() => {
              onJustify(justify === dir ? null : dir)
              onClose()
            }}
            className={`flex flex-1 items-center justify-center rounded border border-border px-2 py-1 outline-none hover:bg-accent${
              justify === dir ? ' bg-accent' : ''
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
          </button>
        ))}
      </div>

      <div className="mt-3 flex justify-start gap-1">
        <button
          onClick={() => onCrop()}
          className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs outline-none hover:bg-accent"
        >
          <Crop className="size-3.5 shrink-0" aria-hidden />
          Crop
        </button>
        {cropped && (
          <button
            onClick={() => {
              onResetCrop()
              onClose()
            }}
            className="flex items-center rounded border border-border px-2 py-1 text-xs outline-none hover:bg-accent"
            title="restore the full uncropped image"
          >
            Reset crop
          </button>
        )}
      </div>

      <button
        onClick={() => {
          onRemove()
          onClose()
        }}
        className="mt-2 flex w-full items-center gap-2 rounded px-1 py-1 text-left outline-none hover:bg-red-50"
        style={{ color: '#dc2626' }}
      >
        <Trash2 className="size-4 shrink-0" style={{ color: '#dc2626' }} aria-hidden />
        Delete image
      </button>
    </div>,
    document.body,
  )
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

//crop selection laid over the full image. drag the interior to move, the
//handles to resize, then confirm (Enter / ✓) or cancel (Esc / ✕)
function CropOverlay({
  fullW,
  fullH,
  initial,
  onConfirm,
  onCancel,
}: {
  fullW: number
  fullH: number
  initial: Rect
  onConfirm: (r: Rect) => void
  onCancel: () => void
}) {
  const [rect, setRect] = useState<Rect>(initial)
  const rectRef = useRef(rect)
  rectRef.current = rect

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onConfirm(rectRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  //drag the interior to move the selection, clamped inside the image
  function startMove(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const s = { px: e.clientX, py: e.clientY, ...rect }
    function move(ev: PointerEvent) {
      const x = Math.min(fullW - s.w, Math.max(0, s.x + ev.clientX - s.px))
      const y = Math.min(fullH - s.h, Math.max(0, s.y + ev.clientY - s.py))
      setRect({ x, y, w: s.w, h: s.h })
    }
    function up(ev: PointerEvent) {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  //resize a single edge or corner, clamped to the image bounds and a min size
  function startResize(e: React.PointerEvent, dir: ResizeDir) {
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const s = { px: e.clientX, py: e.clientY, ...rect }
    function move(ev: PointerEvent) {
      const dx = ev.clientX - s.px
      const dy = ev.clientY - s.py
      let { x, y, w, h } = s
      if (dir.includes('w')) {
        const nx = Math.min(s.x + s.w - MIN_IMG, Math.max(0, s.x + dx))
        x = nx
        w = s.x + s.w - nx
      } else if (dir.includes('e')) {
        w = Math.max(MIN_IMG, Math.min(fullW - s.x, s.w + dx))
      }
      if (dir.includes('n')) {
        const ny = Math.min(s.y + s.h - MIN_IMG, Math.max(0, s.y + dy))
        y = ny
        h = s.y + s.h - ny
      } else if (dir.includes('s')) {
        h = Math.max(MIN_IMG, Math.min(fullH - s.y, s.h + dy))
      }
      setRect({ x, y, w, h })
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
    <div className="canvas-crop" onPointerDown={(e) => e.stopPropagation()}>
      {/*dim everything outside the selection, clipped to the image*/}
      <div className="canvas-crop-mask">
        <div
          className="canvas-crop-shade"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        />
      </div>

      <div
        className="canvas-crop-rect"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        onPointerDown={startMove}
      >
        {HANDLES.map((hd) => (
          <div
            key={hd.dir}
            className={`canvas-image-handle absolute ${hd.cls}`}
            style={{ cursor: hd.cursor }}
            onPointerDown={(e) => startResize(e, hd.dir)}
            aria-hidden
          />
        ))}
      </div>

      <div className="canvas-crop-actions" style={{ left: rect.x, top: rect.y + rect.h + 8 }}>
        <button className="is-confirm" onClick={() => onConfirm(rect)} title="apply crop (Enter), Esc to cancel">
          <Check className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  )
}

//strip a trailing file extension for display / derived names
function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

//a downloadable file pinned to the canvas: icon + name. drag to move, single
//click selects, double click opens, right-click for more actions
function AttachmentBox({
  box,
  url,
  onMove,
  onGeomBegin,
  onGeomCommit,
  onReorder,
  onJustify,
  onRemove,
  onInsertPrintout,
  onInsertPdfWindow,
  onDeletePrintoutImages,
}: {
  box: BoxMeta
  url?: string
  onMove: (x: number, y: number) => void
  onGeomBegin: () => void
  onGeomCommit: () => void
  onReorder: (d: ReorderDir) => void
  onJustify: (j: JustifyDir | null, x?: number) => void
  onRemove: () => void
  onInsertPrintout?: () => void
  onInsertPdfWindow?: () => void
  onDeletePrintoutImages?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  function startDrag(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    ref.current?.focus()
    onGeomBegin()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const start = { px: e.clientX, py: e.clientY, x: dragStartX(box, ref.current), y: box.y, moved: false }
    function move(ev: PointerEvent) {
      const dx = ev.clientX - start.px
      const dy = ev.clientY - start.py
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) start.moved = true
      if (start.moved) onMove(Math.max(0, start.x + dx), Math.max(0, start.y + dy))
    }
    function up(ev: PointerEvent) {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      //a plain click only selects, it does not open (double click opens). a move
      //that actually shifted the pill commits one undo step, else it is a no-op
      onGeomCommit()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  function open() {
    if (url) window.open(url, '_blank')
  }

  return (
    <div
      ref={ref}
      className="canvas-box canvas-attachment"
      style={{
        left: box.x,
        top: box.y,
        transform: box.justify === 'right' ? 'translateX(-100%)' : undefined,
      }}
      tabIndex={0}
      title={box.name ?? box.file}
      onPointerDown={startDrag}
      onDoubleClick={open}
      onContextMenu={(e) => {
        e.preventDefault()
        ref.current?.focus()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          onRemove()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          ref.current?.blur()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          open()
        }
      }}
    >
      <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="canvas-attachment-name">{box.name ?? box.file}</span>

      {menu && (
        <AttachmentMenu
          menu={menu}
          canPrintout={!!onInsertPrintout}
          canPdfWindow={!!onInsertPdfWindow}
          canDeletePrintout={!!onDeletePrintoutImages}
          justify={box.justify}
          onClose={() => setMenu(null)}
          onOpen={open}
          onInsertPrintout={() => onInsertPrintout?.()}
          onInsertPdfWindow={() => onInsertPdfWindow?.()}
          onDeletePrintoutImages={() => onDeletePrintoutImages?.()}
          onReorder={onReorder}
          onJustify={(j) => onJustify(j, j === null ? justifiedX(ref.current, box.justify) : undefined)}
          onRemove={onRemove}
        />
      )}
    </div>
  )
}

//right-click menu for an attachment pill
function AttachmentMenu({
  menu,
  canPrintout,
  canPdfWindow,
  canDeletePrintout,
  justify,
  onClose,
  onOpen,
  onInsertPrintout,
  onInsertPdfWindow,
  onDeletePrintoutImages,
  onReorder,
  onJustify,
  onRemove,
}: {
  menu: { x: number; y: number }
  canPrintout: boolean
  canPdfWindow: boolean
  canDeletePrintout: boolean
  justify?: JustifyDir
  onClose: () => void
  onOpen: () => void
  onInsertPrintout: () => void
  onInsertPdfWindow: () => void
  onDeletePrintoutImages: () => void
  onReorder: (d: ReorderDir) => void
  onJustify: (j: JustifyDir | null) => void
  onRemove: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onClose)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onClose)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const item = 'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none hover:bg-accent'
  //portal to body so a transformed (right-justified) box ancestor doesn't
  //become the containing block for this fixed menu and throw its position off
  return createPortal(
    <div
      role="menu"
      className="fixed z-50 min-w-44 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button role="menuitem" className={item} onClick={() => { onOpen(); onClose() }}>
        <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Open
      </button>
      {canPrintout && (
        <button role="menuitem" className={item} onClick={() => { onInsertPrintout(); onClose() }}>
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Insert as printout
        </button>
      )}
      {canPdfWindow && (
        <button role="menuitem" className={item} onClick={() => { onInsertPdfWindow(); onClose() }}>
          <ScrollText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Insert as PDF window
        </button>
      )}
      <div className="my-1 border-t border-border" />
      <LayerActions onReorder={onReorder} onClose={onClose} />
      <div className="my-1 border-t border-border" />
      <JustifyActions justify={justify} onJustify={onJustify} onClose={onClose} />
      {canDeletePrintout && (
        <>
          <div className="my-1 border-t border-border" />
          <button role="menuitem" className={item} onClick={() => { onDeletePrintoutImages(); onClose() }}>
            <Trash2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            Delete printout images
          </button>
        </>
      )}
      <div className="my-1 border-t border-border" />
      <button
        role="menuitem"
        className={item}
        style={{ color: '#dc2626' }}
        onClick={() => { onRemove(); onClose() }}
      >
        <Trash2 className="size-4 shrink-0" style={{ color: '#dc2626' }} aria-hidden />
        Delete
      </button>
    </div>,
    document.body,
  )
}

//a resizable window that scrolls a pdf inline. drag the title bar to move, drag
//the bottom-right grip to resize the viewport freely (no aspect lock), the
//browser's own pdf viewer handles scrolling through the pages
function PdfBox({
  box,
  url,
  onGeom,
  onGeomBegin,
  onGeomCommit,
  onReorder,
  onJustify,
  onRemove,
}: {
  box: BoxMeta
  url?: string
  onGeom: (patch: Partial<BoxMeta>) => void
  onGeomBegin: () => void
  onGeomCommit: () => void
  onReorder: (d: ReorderDir) => void
  onJustify: (j: JustifyDir | null, x?: number) => void
  onRemove: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  //the title bar, measured so height snaps account for it
  const barRef = useRef<HTMLDivElement>(null)
  //the scroll viewer node, so "extend to whole pdf" can read its exact rendered
  //content height rather than re-deriving it from aspect ratios
  const scrollViewRef = useRef<HTMLDivElement | null>(null)
  //the slideshow page-number field, focused when either number is clicked
  const pageInputRef = useRef<HTMLInputElement>(null)
  //true once a bar drag actually moved, so a click that ends a drag doesn't also
  //open the pdf
  const movedRef = useRef(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  //handles show while the window holds focus
  const [selected, setSelected] = useState(false)
  //zoom-shortcut hint: shows on hover, click pins it open
  const [hintHover, setHintHover] = useState(false)
  const [hintPin, setHintPin] = useState(false)
  //the native pdf viewer is heavy, so don't spin one up until the window is
  //near the viewport. once mounted it stays mounted (keeps scroll position),
  //content-visibility then skips its paint while it's scrolled off-screen
  const [live, setLive] = useState(false)
  //while dragging/resizing the iframe must not eat pointer events or the gesture
  //stalls the moment the cursor crosses into the pdf
  const [interacting, setInteracting] = useState(false)
  //slideshow paging state, only used in 'slides' mode. count comes from the
  //loaded pdf, kept in a ref too so the keyboard stepper can clamp without a
  //stale closure
  const [slidePage, setSlidePage] = useState(1)
  const [slideCount, setSlideCount] = useState(0)
  const slideCountRef = useRef(0)
  //thumbnail sidebar open, and the editable page-number field's draft text
  const [sidebar, setSidebar] = useState(false)
  //keep the rail mounted through the close animation so its content slides out
  //under the clip instead of vanishing, the way the page sidebar does
  const [sidebarMounted, setSidebarMounted] = useState(false)
  useEffect(() => {
    if (sidebar) {
      setSidebarMounted(true)
      return
    }
    const t = setTimeout(() => setSidebarMounted(false), 220)
    return () => clearTimeout(t)
  }, [sidebar])
  //hold off rasterizing thumbnails until the open animation has finished, so the
  //burst of canvas renders doesn't compete with the slide and jank it. the rail
  //shows cheap placeholders while it slides in, then fills
  const [thumbReady, setThumbReady] = useState(false)
  useEffect(() => {
    if (!sidebar) {
      setThumbReady(false)
      return
    }
    const t = setTimeout(() => setThumbReady(true), 230)
    return () => clearTimeout(t)
  }, [sidebar])
  const [pageInput, setPageInput] = useState('1')
  //slideshow zoom: 1 fits the window, >1 overflows (pannable). the last rendered
  //page's css size is kept so "fit one page" can size the window to it
  const [slideZoom, setSlideZoom] = useState(1)
  const pageSizeRef = useRef<{ w: number; h: number } | null>(null)
  //true while the window is snugly sized to the whole pdf ("extend to whole pdf").
  //toggling the sidebar changes the page width (and so the total height), so we
  //re-fit to stay snug; cleared by anything that breaks the snug fit
  const extendedRef = useRef(false)
  const slides = box.mode === 'slides'
  const w = box.w ?? DEFAULT_PDF_W
  const h = box.h ?? DEFAULT_PDF_W

  function gotoPage(n: number) {
    setSlidePage(Math.min(slideCountRef.current || 1, Math.max(1, n)))
  }
  function step(d: number) {
    setSlidePage((p) => Math.min(slideCountRef.current || 1, Math.max(1, p + d)))
  }
  function onSlideCount(n: number) {
    slideCountRef.current = n
    setSlideCount(n)
    setSlidePage((p) => Math.min(p, n || 1))
  }
  //keep the page field in sync when the page changes by arrow/key/thumbnail
  useEffect(() => {
    setPageInput(String(slidePage))
  }, [slidePage])
  //commit a typed page number: clamp into [1, count] (over the max just goes to
  //the last page). always rewrite the field to the clamped value, even when the
  //page didn't change, so an out-of-range entry never lingers in the input
  function commitPage() {
    const max = slideCountRef.current || 1
    const n = parseInt(pageInput, 10)
    const clamped = Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : slidePage
    gotoPage(clamped)
    setPageInput(String(clamped))
  }
  function zoomBy(factor: number) {
    //zooming changes the page height, so the window is no longer snug to the pdf
    extendedRef.current = false
    setSlideZoom((z) => Math.min(6, Math.max(0.5, z * factor)))
  }

  function open() {
    if (url) window.open(url, '_blank')
  }

  //mount the iframe once the window scrolls within ~one screen of the viewport
  useEffect(() => {
    const el = ref.current
    if (!el || live) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLive(true)
          io.disconnect()
        }
      },
      { rootMargin: '800px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [live])

  //clicking empty canvas doesn't move focus off the window (or out of the
  //iframe), so it stays selected. force it: a pointerdown outside the window
  //drops the focus (and the iframe's) and hides the handles. clicks inside the
  //iframe fire in its own document, not here, so reading the pdf is unaffected
  useEffect(() => {
    if (!selected) return
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        ;(document.activeElement as HTMLElement | null)?.blur()
        ref.current.blur()
        setSelected(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [selected])

  //drag the title bar to reposition, clamped to the positive canvas
  function startDrag(e: React.PointerEvent) {
    e.preventDefault()
    //preventScroll: focusing the window must never jump the canvas
    ref.current?.focus({ preventScroll: true })
    onGeomBegin()
    setInteracting(true)
    movedRef.current = false
    const start = { px: e.clientX, py: e.clientY, x: dragStartX(box, ref.current), y: box.y }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    function move(ev: PointerEvent) {
      if (Math.abs(ev.clientX - start.px) > 3 || Math.abs(ev.clientY - start.py) > 3) {
        movedRef.current = true
      }
      onGeom({
        x: Math.max(0, start.x + ev.clientX - start.px),
        y: Math.max(0, start.y + ev.clientY - start.py),
      })
    }
    function up(ev: PointerEvent) {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      setInteracting(false)
      onGeomCommit()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  //resize from any handle, like an image but free: each edge moves its own
  //dimension, corners move both, the opposite side stays pinned via x/y. no
  //aspect lock so the window can be any shape
  function startResize(e: React.PointerEvent, dir: ResizeDir) {
    e.preventDefault()
    e.stopPropagation()
    //a manual resize breaks the snug-to-pdf fit
    extendedRef.current = false
    ref.current?.focus({ preventScroll: true })
    onGeomBegin()
    setInteracting(true)
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const s = { px: e.clientX, py: e.clientY, x: box.x, y: box.y, w, h }
    function move(ev: PointerEvent) {
      const dx = ev.clientX - s.px
      const dy = ev.clientY - s.py
      let { x, y, w: nw, h: nh } = s
      if (dir.includes('e')) nw = Math.max(MIN_PDF_W, s.w + dx)
      if (dir.includes('w')) {
        nw = Math.max(MIN_PDF_W, s.w - dx)
        x = s.x + (s.w - nw)
      }
      if (dir.includes('s')) nh = Math.max(MIN_PDF_H, s.h + dy)
      if (dir.includes('n')) {
        nh = Math.max(MIN_PDF_H, s.h - dy)
        y = s.y + (s.h - nh)
      }
      onGeom({ x, y, w: nw, h: nh })
    }
    function up(ev: PointerEvent) {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      setInteracting(false)
      onGeomCommit()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  //fit one page. in slides mode size the window to the current page at the
  //current zoom (then zoom resets to 1, since the page now fills the window);
  //in scroll mode snap the height to one page at the current width
  function fitOnePage() {
    const barH = barRef.current?.clientHeight ?? 32
    //both modes report the current page's css size at the current zoom: size the
    //window to exactly one page (width and height) and leave the zoom untouched.
    //add the thumbnail rail's width when it's open so the page area still fits
    const ps = pageSizeRef.current
    if (!ps) return
    //one page, not the whole pdf
    extendedRef.current = false
    const side = sidebar ? PDF_SIDEBAR_W : 0
    onGeomBegin()
    if (slides) {
      //the slide stage has no padding
      onGeom({ w: Math.round(ps.w + side), h: Math.round(barH + ps.h) })
    } else {
      //size so the viewer's content area is exactly one page. measure the viewer's
      //real horizontal chrome (padding + the reserved scrollbar gutter) rather than
      //hardcoding it, otherwise the gutter is missed and the page shrinks a little
      //on every click. vertical chrome is just the 10+10 padding (gap, slide, gap)
      const view = scrollViewRef.current
      let chromeX = 54
      let chromeY = 20
      if (view) {
        const cs = getComputedStyle(view)
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
        chromeX = padX + (view.offsetWidth - view.clientWidth)
        chromeY = padY
      }
      onGeom({ w: Math.round(ps.w + chromeX + side), h: Math.round(barH + ps.h + chromeY) })
    }
    onGeomCommit()
    //the window now wraps the page at its current on-screen size, so normalise
    //zoom to 1 (= fills the new width). without this the old zoom stays relative
    //to the new, smaller width and the page no longer fits one page
    setSlideZoom(1)
  }

  //extend the bottom so the window is tall enough to show the whole pdf. measure
  //the viewer's actual rendered content (every slot already reserves its height,
  //plus the real gaps and padding) instead of re-deriving from aspect ratios,
  //which left a blank tail. fall back to the aspect estimate if the viewer node
  //isn't available
  async function fitWholePdf() {
    if (!url) return
    const barH = barRef.current?.clientHeight ?? 32
    const view = scrollViewRef.current
    if (view) {
      onGeomBegin()
      onGeom({ h: Math.round(barH + view.scrollHeight) })
      onGeomCommit()
      //stay snug to the pdf across later sidebar toggles
      extendedRef.current = true
      return
    }
    const data = await fetch(url).then((r) => r.arrayBuffer())
    const { pageAspects } = await import('@/lib/pdfPrintout')
    const aspects = await pageAspects(data)
    if (!aspects.length) return
    const side = sidebar ? PDF_SIDEBAR_W : 0
    //viewer padding is 44 left + 10 right
    const pageW = w - 54 - side
    const pagesH = aspects.reduce((sum, a) => sum + pageW / a, 0)
    const gaps = 10 * Math.max(0, aspects.length - 1)
    onGeomBegin()
    onGeom({ h: Math.round(barH + pagesH + gaps + 20) })
    onGeomCommit()
  }

  //when extended to the whole pdf, a sidebar toggle changes the page width and so
  //the total height; re-fit once the rail animation and re-layout have settled so
  //the window stays snug instead of leaving a tail (or clipping)
  useEffect(() => {
    if (!extendedRef.current) return
    const t = setTimeout(() => {
      const view = scrollViewRef.current
      if (!view) return
      const barH = barRef.current?.clientHeight ?? 32
      onGeomBegin()
      onGeom({ h: Math.round(barH + view.scrollHeight) })
      onGeomCommit()
    }, 260)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebar])

  return (
    <div
      ref={ref}
      className={`canvas-box canvas-pdf${selected ? ' is-selected' : ''}`}
      style={{
        left: box.x,
        top: box.y,
        width: w,
        height: h,
        transform: box.justify === 'right' ? 'translateX(-100%)' : undefined,
      }}
      tabIndex={0}
      onFocus={() => setSelected(true)}
      onBlur={() => setSelected(false)}
      onContextMenu={(e) => {
        e.preventDefault()
        ref.current?.focus({ preventScroll: true })
        setMenu({ x: e.clientX, y: e.clientY })
      }}
      onKeyDown={(e) => {
        //let the page-number field handle its own typing (incl. backspace, which
        //would otherwise delete the whole window)
        if ((e.target as HTMLElement).tagName === 'INPUT') return
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          onRemove()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          ref.current?.blur()
        } else if (slides && e.key === 'ArrowLeft') {
          e.preventDefault()
          step(-1)
        } else if (slides && e.key === 'ArrowRight') {
          e.preventDefault()
          step(1)
        }
      }}
    >
      {/*body clips the bar/iframe to the rounded frame; the handles live outside
         it on the unclipped outer box so they aren't cut off*/}
      <div className="canvas-pdf-body">
      <div
        ref={barRef}
        className="canvas-pdf-bar"
        onPointerDown={startDrag}
        //double-click anywhere on the bar also opens the pdf
        onDoubleClick={() => {
          if (!movedRef.current) open()
        }}
      >
        {/*info button: hover or click reveals the shortcuts for the current
           mode. its own pointer handlers stop the bar's drag/open firing*/}
        <div
          className="canvas-pdf-info"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="canvas-pdf-info-btn"
            aria-label="shortcuts"
            onMouseEnter={() => setHintHover(true)}
            onMouseLeave={() => setHintHover(false)}
            onClick={() => setHintPin((p) => !p)}
          >
            <Info className="size-4" aria-hidden />
          </button>
          {(hintHover || hintPin) && (
            <div className="canvas-pdf-hint" role="tooltip">
              {slides ? (
                <>
                  <div className="canvas-pdf-hint-title">Slideshow</div>
                  <div className="canvas-pdf-hint-row">
                    <kbd>←</kbd> / <kbd>→</kbd> change page
                  </div>
                  <div className="canvas-pdf-hint-row">
                    <kbd>⌘/Ctrl</kbd> + scroll to zoom
                  </div>
                </>
              ) : (
                <>
                  <div className="canvas-pdf-hint-title">Zoom the page</div>
                  <div className="canvas-pdf-hint-row">
                    <kbd>⌘/Ctrl</kbd> + scroll
                  </div>
                  <div className="canvas-pdf-hint-row">
                    <kbd>⌘/Ctrl</kbd> + <kbd>+</kbd> / <kbd>−</kbd>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {/*title: hover highlights, single click opens the pdf in a new tab.
           skipped when the click actually ended a drag of the window*/}
        <button
          type="button"
          className="canvas-pdf-title"
          title={`${box.name ?? box.file} — open in new tab`}
          //own the drag so pointer capture lands on the title (not the bar),
          //otherwise the bar swallows the click and the pdf never opens
          onPointerDown={(e) => {
            e.stopPropagation()
            startDrag(e)
          }}
          //open on the first click only (ignore the 2nd click of a double), and
          //stop the bar's double-click handler from opening a second tab
          onClick={(e) => {
            if (!movedRef.current && e.detail <= 1) open()
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="canvas-attachment-name">{box.name ?? box.file}</span>
        </button>
        {/*thumbnail sidebar toggle (both modes), pushed to the right. own
           pointer handlers stop the bar's drag/open from firing*/}
        <button
          type="button"
          className="canvas-pdf-info-btn ml-auto"
          aria-label={sidebar ? 'hide thumbnails' : 'show thumbnails'}
          title={sidebar ? 'hide thumbnails' : 'show thumbnails'}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => setSidebar((s) => !s)}
        >
          {sidebar ? (
            <PanelRightClose className="size-4" aria-hidden />
          ) : (
            <PanelRightOpen className="size-4" aria-hidden />
          )}
        </button>
      </div>
      {!live || !url ? (
        <div className="canvas-image-loading" />
      ) : slides ? (
        //slideshow: one page rendered at a time, paged by the arrows below
        <PdfSlides
          url={url}
          page={slidePage}
          zoom={slideZoom}
          sidebar={sidebar}
          sidebarRender={sidebarMounted}
          thumbReady={thumbReady}
          onCount={onSlideCount}
          onZoom={zoomBy}
          onPageSize={(pw, ph) => (pageSizeRef.current = { w: pw, h: ph })}
          onJump={gotoPage}
        />
      ) : (
        //scroll: all pages stacked in a canvas viewer we control, so zoom,
        //thumbnails and fit-one-page work the same as slideshow (the native
        //iframe viewer exposed none of that and crashed on teardown)
        <PdfScroll
          url={url}
          viewRef={scrollViewRef}
          zoom={slideZoom}
          sidebar={sidebar}
          sidebarRender={sidebarMounted}
          thumbReady={thumbReady}
          interacting={interacting}
          onCount={onSlideCount}
          onZoom={zoomBy}
          onPageSize={(pw, ph) => (pageSizeRef.current = { w: pw, h: ph })}
        />
      )}

      {/*slideshow controls: a pill at the bottom center, arrows flanking the
         editable page number so they never cover the page*/}
      {slides && slideCount > 0 && (
        <div className="canvas-pdf-controls" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            tabIndex={-1}
            className="canvas-pdf-nav"
            aria-label="previous page"
            disabled={slidePage <= 1}
            //keep focus on the window so arrow-key paging keeps working
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => step(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span
            className="canvas-pdf-count"
            //clicking either number jumps into the editable field
            onClick={() => pageInputRef.current?.focus()}
          >
            <input
              ref={pageInputRef}
              className="canvas-pdf-page-input"
              inputMode="numeric"
              aria-label="page number"
              //width tracks the current number's digits so the pill recenters as it grows/shrinks
              style={{ width: `${Math.max(pageInput.length, 1) + 0.7}ch` }}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitPage()
                  e.currentTarget.blur()
                } else if (e.key === 'Escape') {
                  setPageInput(String(slidePage))
                  e.currentTarget.blur()
                }
              }}
              onBlur={commitPage}
            />
            <span className="canvas-pdf-count-total">/ {slideCount}</span>
          </span>
          <button
            type="button"
            tabIndex={-1}
            className="canvas-pdf-nav"
            aria-label="next page"
            disabled={slidePage >= slideCount}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => step(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
      </div>

      {/*handles only while selected: drag any edge or corner to resize freely*/}
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

      {menu && (
        <PdfMenu
          menu={menu}
          slides={slides}
          justify={box.justify}
          onClose={() => setMenu(null)}
          onOpen={open}
          onToggleMode={() => onGeom({ mode: slides ? 'scroll' : 'slides' })}
          onFitOnePage={fitOnePage}
          onFitWholePdf={fitWholePdf}
          onReorder={onReorder}
          onJustify={(j) => onJustify(j, j === null ? justifiedX(ref.current, box.justify) : undefined)}
          onRemove={onRemove}
        />
      )}
    </div>
  )
}

//slideshow renderer: loads the pdf once and paints the requested page to a
//canvas, scaled to fit the window. only the current page is rendered, so it
//stays light even for big decks
function PdfSlides({
  url,
  page,
  zoom,
  sidebar,
  sidebarRender,
  thumbReady,
  onCount,
  onZoom,
  onPageSize,
  onJump,
}: {
  url?: string
  page: number
  zoom: number
  sidebar: boolean
  //rail stays mounted briefly after close so it can slide out
  sidebarRender: boolean
  //thumbnails only rasterize once true (after the open animation)
  thumbReady: boolean
  onCount: (n: number) => void
  onZoom: (factor: number) => void
  onPageSize: (w: number, h: number) => void
  onJump: (n: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  //the loading task owns teardown: destroy it (not the document proxy, which has
  //no destroy) to tear down the pdf and terminate its worker
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const [ready, setReady] = useState(false)
  //page count, kept in state so the thumbnail list renders once loaded
  const [count, setCount] = useState(0)
  //the area available for the page, tracked so the page re-renders crisp on
  //window resize
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  //load the document (and tear it down on url change/unmount)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    setReady(false)
    ;(async () => {
      const data = await fetch(url).then((r) => r.arrayBuffer())
      const { openPdf } = await import('@/lib/pdfPrintout')
      const task = openPdf(data)
      taskRef.current = task
      const pdf = await task.promise
      if (cancelled) {
        task.destroy().catch(() => {})
        return
      }
      pdfRef.current = pdf
      onCount(pdf.numPages)
      setCount(pdf.numPages)
      setReady(true)
    })()
    return () => {
      cancelled = true
      pdfRef.current = null
      const task = taskRef.current
      taskRef.current = null
      //destroy the loading task (rejects if a render is mid-flight; swallow it)
      //so tearing down (e.g. switching back to scroll view) never crashes
      task?.destroy().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  //paint the current page whenever it, the size, or the zoom changes
  useEffect(() => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    if (!pdf || !canvas || !ready || size.w < 2 || size.h < 2) return
    let cancelled = false
    let task: RenderTask | null = null
    ;(async () => {
      try {
        const { renderPdfPage } = await import('@/lib/pdfPrintout')
        if (cancelled) return
        const res = await renderPdfPage(pdf, page, canvas, size.w, size.h, zoom)
        task = res.task
        onPageSize(res.cssW, res.cssH)
        await task.promise
      } catch {
        //a superseded/cancelled render rejects, ignore it
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ready, size.w, size.h, zoom])

  //ctrl/cmd + wheel zooms. native listener so preventDefault works (react's
  //onWheel is passive and can't stop the page from scrolling instead)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      onZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="canvas-pdf-stage">
      <div ref={wrapRef} className="canvas-pdf-slide">
        {ready ? (
          <canvas ref={canvasRef} className="canvas-pdf-canvas" />
        ) : (
          <div className="canvas-image-loading" />
        )}
      </div>
      <div className={`canvas-pdf-thumbs-wrap${sidebar ? ' is-open' : ''}`}>
        {sidebarRender && ready && pdfRef.current && (
          <div className="canvas-pdf-thumbs">
            {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
              <PdfThumb
                key={n}
                pdf={pdfRef.current!}
                num={n}
                active={n === page}
                ready={thumbReady}
                onClick={() => onJump(n)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

//continuous scroll viewer: every page stacked in a canvas viewer we own, so
//zoom, the thumbnail sidebar and fit-one-page work just like slideshow mode.
//replaces the native iframe viewer, which exposed no zoom/thumbnails and crashed
//on teardown. pages render lazily as they near the viewport so big decks stay cheap
function PdfScroll({
  url,
  viewRef,
  zoom,
  sidebar,
  sidebarRender,
  thumbReady,
  interacting,
  onCount,
  onZoom,
  onPageSize,
}: {
  url?: string
  //mirrors the scroll node up to the parent so "extend to whole pdf" can measure it
  viewRef?: React.MutableRefObject<HTMLDivElement | null>
  zoom: number
  sidebar: boolean
  //rail stays mounted briefly after close so it can slide out
  sidebarRender: boolean
  //thumbnails only rasterize once true (after the open animation)
  thumbReady: boolean
  //while the window is being dragged/resized the viewer must not eat the gesture
  interacting: boolean
  onCount: (n: number) => void
  onZoom: (factor: number) => void
  onPageSize: (cssW: number, cssH: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const [ready, setReady] = useState(false)
  //per-page width/height ratios, sized up front so each slot reserves its height
  //before painting and the scroll position stays put as pages stream in
  const [aspects, setAspects] = useState<number[]>([])
  //the page-area content width (zoom 1 fills it); pages render at width * zoom
  const [width, setWidth] = useState(0)
  //the width the canvases actually rasterize at. it lags `width` so the heavy
  //per-page re-render doesn't fire on every frame while the rail animates the
  //viewer's width; slots keep using the live width and the bitmap just scales
  //until this settles, then repaints crisp
  const [renderWidth, setRenderWidth] = useState(0)
  const renderInited = useRef(false)
  useEffect(() => {
    if (width < 2) return
    if (!renderInited.current) {
      renderInited.current = true
      setRenderWidth(width)
      return
    }
    const t = setTimeout(() => setRenderWidth(width), 160)
    return () => clearTimeout(t)
  }, [width])
  //the most-visible page, drives the active thumbnail and the fit-one-page size
  const [current, setCurrent] = useState(1)
  //the page whose number is briefly flashing after a jump, with a restart nonce
  const [flash, setFlash] = useState<{ page: number; nonce: number } | null>(null)

  //track the page area's content width (client width minus padding)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      setWidth(Math.max(0, el.clientWidth - padX))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  //load the document and every page's aspect ratio (tear down on url/unmount)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    setReady(false)
    setAspects([])
    ;(async () => {
      const data = await fetch(url).then((r) => r.arrayBuffer())
      const { openPdf } = await import('@/lib/pdfPrintout')
      const task = openPdf(data)
      taskRef.current = task
      const pdf = await task.promise
      if (cancelled) {
        task.destroy().catch(() => {})
        return
      }
      pdfRef.current = pdf
      const out: number[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const vp = (await pdf.getPage(i)).getViewport({ scale: 1 })
        if (cancelled) return
        out.push(vp.width && vp.height ? vp.width / vp.height : 0.707)
      }
      if (cancelled) return
      setAspects(out)
      onCount(pdf.numPages)
      setReady(true)
    })()
    return () => {
      cancelled = true
      pdfRef.current = null
      const task = taskRef.current
      taskRef.current = null
      //destroy the loading task, not the document proxy (it has no destroy)
      task?.destroy().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  //pick the most-visible page so the active thumbnail + reported page size follow
  //what the user is reading
  useEffect(() => {
    const root = wrapRef.current
    if (!root || !ready) return
    const ratios = new Map<number, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          ratios.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio)
        }
        let best = 1
        let bestRatio = -1
        ratios.forEach((r, n) => {
          if (r > bestRatio) {
            bestRatio = r
            best = n
          }
        })
        setCurrent(best)
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    slotRefs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [ready, aspects.length])

  //report the current page's rendered css size at the current zoom, so "fit one
  //page" can size the window to exactly one page without touching the zoom
  useEffect(() => {
    const a = aspects[current - 1]
    if (a && width > 0) onPageSize(width * zoom, (width * zoom) / a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, width, aspects, zoom])

  //ctrl/cmd + wheel zooms. native listener so preventDefault beats passive scroll
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      onZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  //the content point sitting at the viewport top, tracked on scroll so a zoom
  //(which rescales every page) can restore it and keep the view stationary
  const anchor = useRef({ page: 1, frac: 0 })
  function onScroll() {
    const el = wrapRef.current
    if (!el) return
    const top = el.scrollTop
    const slots = slotRefs.current
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      if (!s) continue
      if (top < s.offsetTop + s.offsetHeight || i === slots.length - 1) {
        anchor.current = { page: i + 1, frac: s.offsetHeight ? (top - s.offsetTop) / s.offsetHeight : 0 }
        break
      }
    }
  }

  //after a zoom/width relayout, put the anchored content point back at the top so
  //the page you were reading doesn't jump around under your eyes
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const s = slotRefs.current[anchor.current.page - 1]
    if (!s) return
    el.scrollTop = s.offsetTop + anchor.current.frac * s.offsetHeight
  }, [zoom, width])

  function jump(n: number) {
    const el = wrapRef.current
    const s = slotRefs.current[n - 1]
    if (!el || !s) return
    //flash the page number so it's easy to spot where we landed (nonce restarts
    //the animation even when the same page is picked again)
    setFlash({ page: n, nonce: Date.now() })
    //when the viewer scrolls internally, scroll only it (not scrollIntoView,
    //which would also move the note page), instantly, with the slide centred.
    //measure via rects so it's correct regardless of the slot's offsetParent
    if (el.scrollHeight - el.clientHeight > 1) {
      const er = el.getBoundingClientRect()
      const sr = s.getBoundingClientRect()
      const delta = sr.top - er.top + sr.height / 2 - el.clientHeight / 2
      el.scrollTop += delta
      return
    }
    //extended to the whole pdf: the viewer has no scroll, so centre the slide in
    //the note page's visible area (block:'center' centres it in the scrollport)
    s.scrollIntoView({ block: 'center' })
  }

  return (
    <div className="canvas-pdf-stage">
      <div
        ref={(el) => {
          wrapRef.current = el
          if (viewRef) viewRef.current = el
        }}
        className="canvas-pdf-scroll"
        style={
          {
            ...(interacting ? { pointerEvents: 'none' } : {}),
            '--pdf-page-digits': String(Math.max(String(aspects.length || 1).length, 1)),
          } as CSSProperties
        }
        onScroll={onScroll}
      >
        {ready && width > 0 ? (
          aspects.map((a, i) => (
            <PdfPage
              key={i}
              ref={(el) => {
                slotRefs.current[i] = el
              }}
              pdf={pdfRef.current!}
              num={i + 1}
              width={width * zoom}
              renderWidth={renderWidth * zoom}
              aspect={a}
              flash={flash?.page === i + 1 ? flash.nonce : 0}
            />
          ))
        ) : (
          <div className="canvas-image-loading" />
        )}
      </div>
      <div className={`canvas-pdf-thumbs-wrap${sidebar ? ' is-open' : ''}`}>
        {sidebarRender && ready && pdfRef.current && (
          <div className="canvas-pdf-thumbs">
            {aspects.map((_, i) => (
              <PdfThumb
                key={i}
                pdf={pdfRef.current!}
                num={i + 1}
                active={i + 1 === current}
                ready={thumbReady}
                onClick={() => jump(i + 1)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

//one page in the continuous scroll viewer. reserves its height from the aspect
//ratio, then renders its canvas once it nears the viewport, re-rendering crisp
//whenever the target width (zoom) changes. forwards its root node so the viewer
//can observe and scroll to it
const PdfPage = forwardRef<
  HTMLDivElement,
  {
    pdf: PDFDocumentProxy
    num: number
    //live width drives the slot box (cheap, scales every frame)
    width: number
    //lagged width the bitmap rasterizes at, so heavy renders don't fire per frame
    renderWidth: number
    aspect: number
    //nonzero (a nonce) while this page's number should flash after a jump
    flash: number
  }
>(function PdfPage({ pdf, num, width, renderWidth, aspect, flash }, ref) {
  const innerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useImperativeHandle(ref, () => innerRef.current as HTMLDivElement, [])

  //render only once the page scrolls within ~one screen of the viewport
  useEffect(() => {
    const el = innerRef.current
    if (!el || shown) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { root: el.parentElement, rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown])

  //(re)paint at the settled css width. uses renderWidth (lagged) so it doesn't
  //re-raster every frame while the rail animates; the canvas is stretched to the
  //live slot width meanwhile so the page still scales smoothly
  useEffect(() => {
    if (!shown || renderWidth < 2) return
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let task: RenderTask | null = null
    let textLayer: { cancel: () => void } | undefined
    ;(async () => {
      try {
        const { renderPdfPage } = await import('@/lib/pdfPrintout')
        if (cancelled) return
        const res = await renderPdfPage(
          pdf,
          num,
          canvas,
          renderWidth,
          1e6,
          1,
          textRef.current ?? undefined,
        )
        task = res.task
        textLayer = res.textLayer
        await task.promise
        if (cancelled) return
        //fill the slot so the bitmap scales to the live width during animation,
        //overriding the explicit px size renderPdfPage set
        canvas.style.width = '100%'
        canvas.style.height = '100%'
      } catch {
        //superseded/cancelled render rejects, ignore
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
      textLayer?.cancel()
    }
  }, [shown, pdf, num, renderWidth])

  return (
    <div
      ref={innerRef}
      className="canvas-pdf-page"
      data-page={num}
      //reserve the page's height before it paints so scroll position is stable
      style={{ width, height: width / aspect }}
    >
      {/*page number sitting in the left margin, vertically centred on the page.
         the nonce key restarts the flash animation on each jump to this page*/}
      <span
        key={flash}
        className={`canvas-pdf-page-tag${flash ? ' is-flash' : ''}`}
      >
        {num}
      </span>
      {shown && (
        <>
          <canvas ref={canvasRef} className="canvas-pdf-page-canvas" />
          {/*transparent selectable text over the canvas (pdf.js text layer)*/}
          <div ref={textRef} className="textLayer" />
        </>
      )}
    </div>
  )
})

//one thumbnail in the slideshow sidebar. renders its page only once it scrolls
//into the sidebar viewport, keeping big decks cheap. the active page scrolls
//itself into view
function PdfThumb({
  pdf,
  num,
  active,
  ready,
  onClick,
}: {
  pdf: PDFDocumentProxy
  num: number
  active: boolean
  //gate raster until the rail's open animation is done so the render burst
  //doesn't jank the slide
  ready: boolean
  onClick: () => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = btnRef.current
    if (!el || shown) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { root: el.parentElement, rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown])

  useEffect(() => {
    if (!shown || !ready) return
    const canvas = canvasRef.current
    if (!canvas) return
    let task: RenderTask | null = null
    ;(async () => {
      try {
        const { renderPdfPage } = await import('@/lib/pdfPrintout')
        const res = await renderPdfPage(pdf, num, canvas, THUMB_W, THUMB_W * 6)
        task = res.task
        await task.promise
      } catch {
        //cancelled, ignore
      }
    })()
    return () => task?.cancel()
  }, [shown, ready, pdf, num])

  useEffect(() => {
    if (active) btnRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <button
      ref={btnRef}
      type="button"
      tabIndex={-1}
      className={`canvas-pdf-thumb${active ? ' is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {shown && ready ? (
        <canvas ref={canvasRef} className="canvas-pdf-thumb-canvas" />
      ) : (
        <div className="canvas-pdf-thumb-ph" />
      )}
      <span className="canvas-pdf-thumb-num">{num}</span>
    </button>
  )
}

//right-click menu for a pdf window
function PdfMenu({
  menu,
  slides,
  justify,
  onClose,
  onOpen,
  onToggleMode,
  onFitOnePage,
  onFitWholePdf,
  onReorder,
  onJustify,
  onRemove,
}: {
  menu: { x: number; y: number }
  slides: boolean
  justify?: JustifyDir
  onClose: () => void
  onOpen: () => void
  onToggleMode: () => void
  onFitOnePage: () => void
  onFitWholePdf: () => void
  onReorder: (d: ReorderDir) => void
  onJustify: (j: JustifyDir | null) => void
  onRemove: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onClose)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onClose)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const item = 'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none hover:bg-accent'
  //portal to body so a transformed (right-justified) box ancestor doesn't
  //become the containing block for this fixed menu and throw its position off
  return createPortal(
    <div
      role="menu"
      className="fixed z-50 min-w-48 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button role="menuitem" className={item} onClick={() => { onOpen(); onClose() }}>
        <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Open
      </button>
      <button role="menuitem" className={item} onClick={() => { onToggleMode(); onClose() }}>
        {slides ? (
          <ScrollText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <Presentation className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        {slides ? 'Scrolling view' : 'Slideshow'}
      </button>
      <button role="menuitem" className={item} onClick={() => { onFitOnePage(); onClose() }}>
        <RectangleHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Fit one page
      </button>
      {/*continuous-scroll only: stack every page's height*/}
      {!slides && (
        <button role="menuitem" className={item} onClick={() => { onFitWholePdf(); onClose() }}>
          <StretchVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Extend to whole PDF
        </button>
      )}
      <div className="my-1 border-t border-border" />
      <LayerActions onReorder={onReorder} onClose={onClose} />
      <div className="my-1 border-t border-border" />
      <JustifyActions justify={justify} onJustify={onJustify} onClose={onClose} />
      <div className="my-1 border-t border-border" />
      <button
        role="menuitem"
        className={item}
        style={{ color: '#dc2626' }}
        onClick={() => { onRemove(); onClose() }}
      >
        <Trash2 className="size-4 shrink-0" style={{ color: '#dc2626' }} aria-hidden />
        Delete
      </button>
    </div>,
    document.body,
  )
}

//a single draggable, editable text container
function Box({ box, autoFocus, initialHtml, onInput, onMove, onResize, onGeomBegin, onGeomCommit, onReorder, onJustify, onRemove }: BoxProps) {
  const body = useRef<HTMLDivElement>(null)
  //the box root, measured so unjustify can leave it where it currently sits
  const rootRef = useRef<HTMLDivElement>(null)
  //right-click menu position, null when closed
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
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
    onGeomBegin()
    const start = { px: e.clientX, py: e.clientY, x: dragStartX(box, rootRef.current), y: box.y }
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
      onGeomCommit()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  //drag the right edge to resize the width
  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    onGeomBegin()
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
      onGeomCommit()
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
      ref={rootRef}
      className="canvas-box group"
      //no stored width: grow with the text up to BOX_MAX_W then wrap. once
      //resized, use the fixed width the user dragged to
      style={{
        left: box.x,
        top: box.y,
        //no stored width grows with text up to BOX_MAX_W; a stored width is fixed
        ...(box.w ? { width: box.w } : { width: 'max-content', maxWidth: BOX_MAX_W }),
        //right-justified: pin the right edge to the marker regardless of width
        transform: box.justify === 'right' ? 'translateX(-100%)' : undefined,
      }}
      //stop canvas-create clicks from firing under the box
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
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

      {menu && (
        <BoxMenu
          menu={menu}
          justify={box.justify}
          onClose={() => setMenu(null)}
          onReorder={onReorder}
          onJustify={(j) => onJustify(j, j === null ? justifiedX(rootRef.current, box.justify) : undefined)}
          onRemove={onRemove}
        />
      )}
    </div>
  )
}

//right-click menu for a text container: stacking controls plus delete
function BoxMenu({
  menu,
  justify,
  onClose,
  onReorder,
  onJustify,
  onRemove,
}: {
  menu: { x: number; y: number }
  justify?: JustifyDir
  onClose: () => void
  onReorder: (d: ReorderDir) => void
  onJustify: (j: JustifyDir | null) => void
  onRemove: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onClose)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onClose)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  //portal to body so a transformed (right-justified) box ancestor doesn't
  //become the containing block for this fixed menu and throw its position off
  return createPortal(
    <div
      role="menu"
      className="fixed z-50 min-w-44 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <LayerActions onReorder={onReorder} onClose={onClose} />
      <div className="my-1 border-t border-border" />
      <JustifyActions justify={justify} onJustify={onJustify} onClose={onClose} />
      <div className="my-1 border-t border-border" />
      <button
        role="menuitem"
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none hover:bg-accent"
        style={{ color: '#dc2626' }}
        onClick={() => {
          onRemove()
          onClose()
        }}
      >
        <Trash2 className="size-4 shrink-0" style={{ color: '#dc2626' }} aria-hidden />
        Delete
      </button>
    </div>,
    document.body,
  )
}
