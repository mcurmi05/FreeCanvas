import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Eraser,
  Highlighter,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Moon,
  PaintBucket,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareSigma,
  Strikethrough,
  Subscript,
  Sun,
  Superscript,
  Underline,
  Undo2,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import * as katex from 'katex'
import { Scope, StyleAttributor } from 'parchment'
import Quill from 'quill'
import '@fontsource/caladea/400.css'
import '@fontsource/caladea/700.css'
import '@fontsource/carlito/400.css'
import '@fontsource/carlito/700.css'
import '@fontsource/lato/400.css'
import '@fontsource/lato/700.css'
import '@fontsource/libre-baskerville/400.css'
import '@fontsource/merriweather/400.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/nunito/400.css'
import '@fontsource/open-sans/400.css'
import '@fontsource/oswald/400.css'
import '@fontsource/roboto/400.css'
import '@fontsource/source-code-pro/400.css'
import '@fontsource/source-serif-4/400.css'
import 'katex/dist/katex.min.css'
import 'quill/dist/quill.snow.css'

const DEFAULT_FONT_SIZE = '16px'
const DEFAULT_LINE_HEIGHT = '24px'
const FONT_OPTIONS = [
  { label: 'System UI', value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Arial Black', value: 'Arial Black, Arial, sans-serif' },
  { label: 'Arial Narrow', value: 'Arial Narrow, Arial, sans-serif' },
  { label: 'Aptos', value: 'Aptos, Carlito, Calibri, Arial, sans-serif' },
  { label: 'Baskerville', value: '"Libre Baskerville", Baskerville, Georgia, serif' },
  { label: 'Bodoni', value: '"Bodoni 72", "Bodoni MT", Didot, Georgia, serif' },
  { label: 'Book Antiqua', value: '"Book Antiqua", "Palatino Linotype", Palatino, Georgia, serif' },
  { label: 'Brush Script', value: '"Brush Script MT", "Comic Sans MS", cursive' },
  { label: 'Calibri', value: 'Carlito, Calibri, Arial, sans-serif' },
  { label: 'Cambria', value: 'Caladea, Cambria, Georgia, serif' },
  { label: 'Candara', value: 'Lato, Candara, Calibri, sans-serif' },
  { label: 'Century Gothic', value: '"Century Gothic", Montserrat, Arial, sans-serif' },
  { label: 'Comic Sans', value: '"Comic Sans MS", "Comic Sans", cursive' },
  { label: 'Consolas', value: '"Source Code Pro", Consolas, "Courier New", monospace' },
  { label: 'Constantia', value: 'Constantia, Caladea, Georgia, serif' },
  { label: 'Corbel', value: 'Corbel, Carlito, Arial, sans-serif' },
  { label: 'Courier New', value: '"Courier New", "Source Code Pro", monospace' },
  { label: 'Didot', value: 'Didot, Bodoni 72, Georgia, serif' },
  { label: 'Franklin Gothic', value: '"Franklin Gothic Medium", "Arial Narrow", Arial, sans-serif' },
  { label: 'Futura', value: 'Futura, "Century Gothic", Montserrat, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Garamond', value: 'Libre Baskerville, Garamond, Georgia, serif' },
  { label: 'Geneva', value: 'Geneva, Verdana, sans-serif' },
  { label: 'Gill Sans', value: '"Gill Sans", "Gill Sans MT", Calibri, Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Hoefler Text', value: '"Hoefler Text", Georgia, serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, "Arial Narrow", sans-serif' },
  { label: 'Lucida Console', value: '"Lucida Console", Monaco, "Source Code Pro", monospace' },
  { label: 'Lucida Sans', value: '"Lucida Sans Unicode", "Lucida Grande", Arial, sans-serif' },
  { label: 'Menlo', value: 'Menlo, Monaco, "Source Code Pro", monospace' },
  { label: 'Merriweather', value: 'Merriweather, Georgia, serif' },
  { label: 'Monaco', value: 'Monaco, Menlo, "Source Code Pro", monospace' },
  { label: 'Montserrat', value: 'Montserrat, Arial, sans-serif' },
  { label: 'Nunito', value: 'Nunito, Arial, sans-serif' },
  { label: 'Open Sans', value: 'Open Sans, Arial, sans-serif' },
  { label: 'Optima', value: 'Optima, Candara, Lato, sans-serif' },
  { label: 'Oswald', value: 'Oswald, Arial, sans-serif' },
  { label: 'Palatino', value: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
  { label: 'Roboto', value: 'Roboto, Arial, sans-serif' },
  { label: 'Rockwell', value: 'Rockwell, Courier New, serif' },
  { label: 'Segoe UI', value: '"Segoe UI", "Open Sans", Arial, sans-serif' },
  { label: 'Source Serif', value: '"Source Serif 4", Georgia, serif' },
  { label: 'Tahoma', value: 'Tahoma, Verdana, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Cursive', value: 'cursive' },
  { label: 'Fantasy', value: 'fantasy' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'Sans Serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
]
const DEFAULT_FONT_VALUE = FONT_OPTIONS[0].value
const FONT_FAMILIES = FONT_OPTIONS.map((font) => font.value)
const FONT_SIZES = ['8px', '9px', '10px', '11px', '12px', '14px', DEFAULT_FONT_SIZE, '18px', '20px', '24px', '28px', '32px', '36px', '48px', '72px']
const LINE_HEIGHTS = ['1', '1.15', '1.25', '1.5', '2', DEFAULT_LINE_HEIGHT, '28px', '32px']

type QuillRange = { index: number; length: number }
type FormatValue = string | number | boolean
type FormatState = Record<string, FormatValue | FormatValue[] | undefined>
type EmbedDialogType = 'link' | 'video' | 'formula'
type EmbedDialogState = {
  type: EmbedDialogType
  value: string
} | null
type HistoryStack = {
  clear?: () => void
  redo?: () => void
  stack?: { undo?: unknown[]; redo?: unknown[] }
  undo?: () => void
}

export interface EditorCan {
  can: () => {
    undo: () => boolean
    redo: () => boolean
  }
}

interface Props {
  content: string
  onSave: (html: string) => void
  editorOut?: React.MutableRefObject<EditorCan | null>
}

function configureQuillFormats() {
  ;(window as unknown as { katex: typeof katex }).katex = katex
  const FontStyle = Quill.import('attributors/style/font') as { whitelist?: string[] }
  const SizeStyle = Quill.import('attributors/style/size') as { whitelist?: string[] }
  const LineHeightStyle = new StyleAttributor('lineHeight', 'line-height', {
    scope: Scope.BLOCK,
  })
  FontStyle.whitelist = FONT_FAMILIES
  SizeStyle.whitelist = FONT_SIZES
  Quill.register('formats/font', FontStyle as never, true)
  Quill.register('formats/size', SizeStyle as never, true)
  Quill.register(LineHeightStyle as never, true)
}

configureQuillFormats()

function isEditorEmpty(html: string) {
  return html === '<p><br></p>' || html.trim() === ''
}

function editorHtml(editor: Quill) {
  const html = editor.getSemanticHTML()
  return isEditorEmpty(html) ? '<p></p>' : html
}

function loadHtml(editor: Quill, html: string) {
  editor.setText('', 'silent')
  editor.clipboard.dangerouslyPasteHTML(0, html || '<p></p>', 'silent')
}

function history(editor: Quill) {
  return editor.getModule('history') as HistoryStack
}

function canUndo(editor: Quill | null) {
  return !!editor && !!history(editor).stack?.undo?.length
}

function canRedo(editor: Quill | null) {
  return !!editor && !!history(editor).stack?.redo?.length
}

function clearHistory(editor: Quill) {
  history(editor).clear?.()
}

function closeToolbarPickers(toolbar: HTMLElement | null) {
  toolbar?.querySelectorAll('.ql-picker.ql-expanded').forEach((picker) => {
    picker.classList.remove('ql-expanded')
    picker.querySelector<HTMLElement>('.ql-picker-label')?.setAttribute('aria-expanded', 'false')
  })
  const active = document.activeElement
  if (active instanceof HTMLElement && toolbar?.contains(active)) active.blur()
}

function normalizeSize(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return DEFAULT_FONT_SIZE
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`
  if (/^\d+(\.\d+)?(px|pt|em|rem|%)$/.test(trimmed)) return trimmed
  return DEFAULT_FONT_SIZE
}

function normalizeLineHeight(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return DEFAULT_LINE_HEIGHT
  if (/^\d+(\.\d+)?$/.test(trimmed)) return trimmed
  if (/^\d+(\.\d+)?(px|pt|em|rem|%)$/.test(trimmed)) return trimmed
  return DEFAULT_LINE_HEIGHT
}

function activeCanvasText() {
  const sel = window.getSelection()
  const node = sel?.anchorNode
  const el = node instanceof HTMLElement ? node : node?.parentElement
  return el?.closest?.('.canvas-box-text') as HTMLElement | null
}

function dispatchCanvasInput(box: HTMLElement) {
  box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatSetInlineTextDirection' }))
}

function formatValue(formats: FormatState, key: string) {
  const value = formats[key]
  return Array.isArray(value) ? value[0] : value
}

function Tooltip({
  label,
  shortcut,
  children,
}: {
  label: string
  shortcut?: string
  children: React.ReactNode
}) {
  return (
    <span className="rte-tip" data-tip={shortcut ? `${label} (${shortcut})` : label}>
      {children}
    </span>
  )
}

function ToolbarButton({
  label,
  shortcut,
  active,
  disabled,
  className = '',
  value,
  onClick,
  children,
}: {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  className?: string
  value?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        className={`${className}${active ? ' is-active' : ''}`}
        disabled={disabled}
        value={value}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function FontSelect({
  label,
  shortcut,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  label: string
  shortcut?: string
  value: string
  onChange: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const current = FONT_OPTIONS.find((font) => font.value === value) ?? FONT_OPTIONS[0]
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <div
        className="rte-font-menu"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onOpenChange(false)
        }}
      >
        <button
          type="button"
          className="rte-font-trigger"
          aria-label={label}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onOpenChange(!open)}
        >
          <span style={{ fontFamily: current.value }}>{current.label}</span>
        </button>
        {open && (
          <div className="rte-font-popover" role="listbox">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.value}
                type="button"
                role="option"
                aria-selected={font.value === value}
                className={font.value === value ? 'is-selected' : undefined}
                style={{ fontFamily: font.value }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(font.value)
                  onOpenChange(false)
                }}
              >
                {font.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </Tooltip>
  )
}

function ToolbarColor({
  label,
  shortcut,
  value,
  onChange,
  children,
}: {
  label: string
  shortcut?: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <label className="rte-color-button">
        {children}
        <input
          aria-label={label}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </Tooltip>
  )
}

function FontColorIcon({ color }: { color: string }) {
  return (
    <span
      className="rte-font-color-icon"
      style={{ '--rte-color': color } as CSSProperties}
      aria-hidden
    >
      A
    </span>
  )
}

export function PageEditor({ content, onSave, editorOut }: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Quill | null>(null)
  const savedRange = useRef<QuillRange | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const onSaveRef = useRef(onSave)
  const contentRef = useRef(content)
  const [formats, setFormats] = useState<FormatState>({})
  const [historyState, setHistoryState] = useState({ undo: false, redo: false })
  const [fontSizeDraft, setFontSizeDraft] = useState(DEFAULT_FONT_SIZE)
  const [lineHeightDraft, setLineHeightDraft] = useState(DEFAULT_LINE_HEIGHT)
  const [lightCode, setLightCode] = useState(false)
  const [fontOpen, setFontOpen] = useState(false)
  const [embedDialog, setEmbedDialog] = useState<EmbedDialogState>(null)

  onSaveRef.current = onSave

  const editorBridge = useMemo<EditorCan>(
    () => ({
      can: () => ({
        undo: () => canUndo(editorRef.current),
        redo: () => canRedo(editorRef.current),
      }),
    }),
    [],
  )

  useEffect(() => {
    editorOut && (editorOut.current = editorBridge)
    return () => {
      if (editorOut?.current === editorBridge) editorOut.current = null
    }
  }, [editorBridge, editorOut])

  useEffect(() => {
    if (!fontOpen) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('.rte-font-menu')) return
      setFontOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setFontOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [fontOpen])

  function currentRange(editor: Quill) {
    const range = editor.getSelection()
    if (range) {
      savedRange.current = range
      return range
    }
    return savedRange.current ?? { index: Math.max(0, editor.getLength() - 1), length: 0 }
  }

  function focusRange(editor: Quill) {
    const range = currentRange(editor)
    editor.focus()
    editor.setSelection(range, 'silent')
    return range
  }

  function refreshState(editor: Quill) {
    const range = editor.getSelection()
    if (range) savedRange.current = range
    const nextFormats = editor.getFormat(range ?? savedRange.current ?? undefined) as FormatState
    setFormats(nextFormats)
    setFontSizeDraft(String(formatValue(nextFormats, 'size') ?? DEFAULT_FONT_SIZE))
    setLineHeightDraft(String(formatValue(nextFormats, 'lineHeight') ?? DEFAULT_LINE_HEIGHT))
    setHistoryState({
      undo: canUndo(editor),
      redo: canRedo(editor),
    })
  }

  function toggleInline(format: string) {
    const editor = editorRef.current
    if (!editor) return
    focusRange(editor)
    const active = !!formatValue(editor.getFormat() as FormatState, format)
    editor.format(format, active ? false : true, 'user')
    refreshState(editor)
  }

  function setInline(format: string, value: string | boolean) {
    const editor = editorRef.current
    if (!editor) return
    focusRange(editor)
    editor.format(format, value, 'user')
    refreshState(editor)
  }

  function toggleLine(format: string, value: FormatValue = true) {
    const editor = editorRef.current
    if (!editor) return
    const range = focusRange(editor)
    const active = formatValue(editor.getFormat(range) as FormatState, format)
    editor.formatLine(range.index, range.length, format, active === value ? false : value, 'user')
    refreshState(editor)
  }

  function setAlign(value: string | false) {
    const box = activeCanvasText()
    if (box) {
      document.execCommand(
        value === 'center' ? 'justifyCenter' : value === 'right' ? 'justifyRight' : 'justifyLeft',
      )
      box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatSetBlockTextDirection' }))
      return
    }
    const editor = editorRef.current
    if (!editor) return
    const range = focusRange(editor)
    editor.formatLine(range.index, range.length, 'align', value, 'user')
    refreshState(editor)
  }

  function setFont(value: string) {
    const box = activeCanvasText()
    if (box) {
      box.style.fontFamily = value || ''
      dispatchCanvasInput(box)
      return
    }
    setInline('font', value || false)
  }

  function setFontSize(value: string) {
    const size = normalizeSize(value)
    setFontSizeDraft(size)
    const box = activeCanvasText()
    if (box) {
      box.style.fontSize = size
      dispatchCanvasInput(box)
      return
    }
    setInline('size', size === DEFAULT_FONT_SIZE ? false : size)
  }

  function setLineHeight(value: string) {
    const lineHeight = normalizeLineHeight(value)
    setLineHeightDraft(lineHeight)
    const box = activeCanvasText()
    if (box) {
      box.style.lineHeight = lineHeight
      dispatchCanvasInput(box)
      return
    }
    const editor = editorRef.current
    if (!editor) return
    const range = focusRange(editor)
    editor.formatLine(range.index, range.length, 'lineHeight', lineHeight === DEFAULT_LINE_HEIGHT ? false : lineHeight, 'user')
    refreshState(editor)
  }

  function openEmbedDialog(type: EmbedDialogType) {
    const editor = editorRef.current
    if (!editor) return
    const range = focusRange(editor)
    const current = type === 'link' ? formatValue(editor.getFormat(range) as FormatState, 'link') : null
    setEmbedDialog({
      type,
      value:
        typeof current === 'string'
          ? current
          : type === 'formula'
            ? 'e=mc^2'
            : 'https://',
    })
  }

  function applyEmbedDialog() {
    if (!embedDialog) return
    const editor = editorRef.current
    if (!editor) return
    const range = focusRange(editor)
    const value = embedDialog.value.trim()
    if (embedDialog.type === 'link') {
      editor.format('link', value || false, 'user')
    } else if (value) {
      editor.insertEmbed(range.index, embedDialog.type, value, 'user')
      editor.setSelection(range.index + 1, 0, 'silent')
    }
    setEmbedDialog(null)
    refreshState(editor)
  }

  function undo() {
    const editor = editorRef.current
    if (!editor) return
    history(editor).undo?.()
    refreshState(editor)
  }

  function redo() {
    const editor = editorRef.current
    if (!editor) return
    history(editor).redo?.()
    refreshState(editor)
  }

  useEffect(() => {
    const mount = mountRef.current
    const toolbar = toolbarRef.current
    if (!mount || !toolbar) return

    const editor = new Quill(mount, {
      bounds: mount,
      modules: {
        toolbar: false,
        history: {
          delay: 500,
          maxStack: 100,
          userOnly: true,
        },
      },
      placeholder: '',
      theme: 'snow',
    })

    editor.root.classList.add('rte-document')
    loadHtml(editor, contentRef.current)
    clearHistory(editor)
    editorRef.current = editor

    const scheduleSave = () => {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        const html = editorHtml(editor)
        contentRef.current = html
        onSaveRef.current(html)
      }, 600)
    }
    const onEditorChange = () => refreshState(editor)
    const closeFromEditor = () => closeToolbarPickers(toolbar)
    const closeFromOutside = (event: PointerEvent) => {
      if (toolbar.contains(event.target as Node)) return
      closeToolbarPickers(toolbar)
    }
    const keepInlineFormatsOnEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      const before = editor.getFormat() as FormatState
      const inlineKeys = ['font', 'size', 'color', 'background', 'bold', 'italic', 'underline', 'strike', 'script']
      window.setTimeout(() => {
        if (!editor.hasFocus()) return
        for (const key of inlineKeys) {
          const value = formatValue(before, key)
          if (value !== undefined && value !== false) editor.format(key, value, 'silent')
        }
        refreshState(editor)
      }, 0)
    }

    editor.on('text-change', scheduleSave)
    editor.on('editor-change', onEditorChange)
    editor.root.addEventListener('pointerdown', closeFromEditor)
    editor.root.addEventListener('keydown', keepInlineFormatsOnEnter)
    document.addEventListener('pointerdown', closeFromOutside)
    refreshState(editor)

    return () => {
      window.clearTimeout(saveTimer.current)
      editor.off('text-change', scheduleSave)
      editor.off('editor-change', onEditorChange)
      editor.root.removeEventListener('pointerdown', closeFromEditor)
      editor.root.removeEventListener('keydown', keepInlineFormatsOnEnter)
      document.removeEventListener('pointerdown', closeFromOutside)
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || content === contentRef.current) return
    contentRef.current = content
    loadHtml(editor, content)
    clearHistory(editor)
    savedRange.current = null
    refreshState(editor)
  }, [content])

  const align = formatValue(formats, 'align')
  const list = formatValue(formats, 'list')
  const script = formatValue(formats, 'script')
  const fontValue = formatValue(formats, 'font')
  const font = typeof fontValue === 'string' ? fontValue : ''
  const color = String(formatValue(formats, 'color') ?? '#000000')
  const background = String(formatValue(formats, 'background') ?? '#ffffff')

  return (
    <>
      <div className={`quill-editor-shell${lightCode ? ' code-light' : ''}`}>
      <div ref={toolbarRef} className="rte-toolbar">
        <span className="ql-formats">
          <FontSelect
            label="Font family"
            value={font || DEFAULT_FONT_VALUE}
            onChange={setFont}
            open={fontOpen}
            onOpenChange={setFontOpen}
          />
          <Tooltip label="Font size">
            <input
              aria-label="Font size"
              className="rte-size-input"
              list="rte-font-size-options"
              value={fontSizeDraft}
              onChange={(event) => setFontSizeDraft(event.target.value)}
              onBlur={() => setFontSize(fontSizeDraft)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  setFontSize(fontSizeDraft)
                  event.currentTarget.blur()
                }
              }}
            />
          </Tooltip>
          <datalist id="rte-font-size-options">
            {FONT_SIZES.map((size) => (
              <option key={size} value={size} />
            ))}
          </datalist>
          <Tooltip label="Line spacing">
            <input
              aria-label="Line spacing"
              className="rte-size-input"
              list="rte-line-height-options"
              value={lineHeightDraft}
              onChange={(event) => setLineHeightDraft(event.target.value)}
              onBlur={() => setLineHeight(lineHeightDraft)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  setLineHeight(lineHeightDraft)
                  event.currentTarget.blur()
                }
              }}
            />
          </Tooltip>
          <datalist id="rte-line-height-options">
            {LINE_HEIGHTS.map((lineHeight) => (
              <option key={lineHeight} value={lineHeight} />
            ))}
          </datalist>
        </span>
        <span className="ql-formats">
          <ToolbarButton label="Undo" shortcut="Cmd/Ctrl+Z" onClick={undo} disabled={!historyState.undo}>
            <Undo2 className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Redo" shortcut="Cmd/Ctrl+Shift+Z" onClick={redo} disabled={!historyState.redo}>
            <Redo2 className="size-4" aria-hidden />
          </ToolbarButton>
        </span>
        <span className="ql-formats">
          <ToolbarButton label="Bold" shortcut="Cmd/Ctrl+B" active={!!formats.bold} onClick={() => toggleInline('bold')}>
            <Bold className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Italic" shortcut="Cmd/Ctrl+I" active={!!formats.italic} onClick={() => toggleInline('italic')}>
            <Italic className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Underline" shortcut="Cmd/Ctrl+U" active={!!formats.underline} onClick={() => toggleInline('underline')}>
            <Underline className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Strikethrough" active={!!formats.strike} onClick={() => toggleInline('strike')}>
            <Strikethrough className="size-4" aria-hidden />
          </ToolbarButton>
        </span>
        <span className="ql-formats">
          <ToolbarColor label="Text color" value={color} onChange={(value) => setInline('color', value)}>
            <FontColorIcon color={color} />
          </ToolbarColor>
          <ToolbarColor label="Highlight color" value={background} onChange={(value) => setInline('background', value)}>
            <Highlighter className="size-4" aria-hidden />
          </ToolbarColor>
        </span>
        <span className="ql-formats">
          <ToolbarButton label="Bullet list" active={list === 'bullet'} onClick={() => toggleLine('list', 'bullet')}>
            <List className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Numbered list" active={list === 'ordered'} onClick={() => toggleLine('list', 'ordered')}>
            <ListOrdered className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Checklist" active={list === 'check'} onClick={() => toggleLine('list', 'check')}>
            <ListChecks className="size-4" aria-hidden />
          </ToolbarButton>
        </span>
        <span className="ql-formats">
          <ToolbarButton label="Align left" active={!align} onClick={() => setAlign(false)}>
            <AlignLeft className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Align center" active={align === 'center'} onClick={() => setAlign('center')}>
            <AlignCenter className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Align right" active={align === 'right'} onClick={() => setAlign('right')}>
            <AlignRight className="size-4" aria-hidden />
          </ToolbarButton>
        </span>
        <span className="ql-formats">
          <ToolbarButton label="Quote" active={!!formats.blockquote} onClick={() => toggleLine('blockquote')}>
            <Quote className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Code block" active={!!formats['code-block']} onClick={() => toggleLine('code-block')}>
            <Code className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label={lightCode ? 'Use dark code block' : 'Use light code block'} active={lightCode} onClick={() => setLightCode((next) => !next)}>
            {lightCode ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          </ToolbarButton>
        </span>
        <span className="ql-formats">
          <ToolbarButton label="Subscript" active={script === 'sub'} onClick={() => setInline('script', script === 'sub' ? false : 'sub')}>
            <Subscript className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Superscript" active={script === 'super'} onClick={() => setInline('script', script === 'super' ? false : 'super')}>
            <Superscript className="size-4" aria-hidden />
          </ToolbarButton>
        </span>
        <span className="ql-formats">
          <ToolbarButton label="Link" shortcut="Cmd/Ctrl+K" active={!!formats.link} onClick={() => openEmbedDialog('link')}>
            <Link className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Video embed" onClick={() => openEmbedDialog('video')}>
            <Video className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Math formula" onClick={() => openEmbedDialog('formula')}>
            <SquareSigma className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Clear formatting" onClick={() => {
            const editor = editorRef.current
            if (!editor) return
            const range = focusRange(editor)
            editor.removeFormat(range.index, range.length || 1, 'user')
            refreshState(editor)
          }}>
            <RemoveFormatting className="size-4" aria-hidden />
          </ToolbarButton>
          <PaintBucket className="rte-static-icon size-4" aria-hidden />
          <Eraser className="rte-static-icon size-4" aria-hidden />
        </span>
        <span className="sr-only" aria-live="polite">
          Undo {historyState.undo ? 'available' : 'unavailable'}, redo {historyState.redo ? 'available' : 'unavailable'}
        </span>
      </div>
        <div ref={mountRef} className="rte-content" />
      </div>
      <Dialog open={embedDialog !== null} onOpenChange={(open) => !open && setEmbedDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {embedDialog?.type === 'link'
                ? 'Edit link'
                : embedDialog?.type === 'video'
                  ? 'Embed video'
                  : 'Insert formula'}
            </DialogTitle>
            <DialogDescription>
              {embedDialog?.type === 'link'
                ? 'Enter a URL for the selected text.'
                : embedDialog?.type === 'video'
                  ? 'Paste a video embed URL.'
                  : 'Enter a KaTeX-compatible formula.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              applyEmbedDialog()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="rte-embed-value">
                {embedDialog?.type === 'formula' ? 'Formula' : 'URL'}
              </Label>
              <Input
                id="rte-embed-value"
                autoFocus
                value={embedDialog?.value ?? ''}
                placeholder={
                  embedDialog?.type === 'formula'
                    ? 'e=mc^2'
                    : 'https://example.com'
                }
                onChange={(event) =>
                  setEmbedDialog((current) =>
                    current ? { ...current, value: event.target.value } : current,
                  )
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEmbedDialog(null)}>
                Cancel
              </Button>
              <Button type="submit">
                {embedDialog?.type === 'link' ? 'Apply' : 'Insert'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
