import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Highlighter,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareSigma,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo2,
  Video,
} from 'lucide-react'
import { Parser } from 'acorn'
import acornJsx from 'acorn-jsx'
import hljs from 'highlight.js/lib/core'
import langBash from 'highlight.js/lib/languages/bash'
import langC from 'highlight.js/lib/languages/c'
import langCpp from 'highlight.js/lib/languages/cpp'
import langCsharp from 'highlight.js/lib/languages/csharp'
import langCss from 'highlight.js/lib/languages/css'
import langGo from 'highlight.js/lib/languages/go'
import langJava from 'highlight.js/lib/languages/java'
import langJavascript from 'highlight.js/lib/languages/javascript'
import langJson from 'highlight.js/lib/languages/json'
import langKotlin from 'highlight.js/lib/languages/kotlin'
import langMarkdown from 'highlight.js/lib/languages/markdown'
import langPhp from 'highlight.js/lib/languages/php'
import langPython from 'highlight.js/lib/languages/python'
import langRuby from 'highlight.js/lib/languages/ruby'
import langRust from 'highlight.js/lib/languages/rust'
import langSql from 'highlight.js/lib/languages/sql'
import langSwift from 'highlight.js/lib/languages/swift'
import langTypescript from 'highlight.js/lib/languages/typescript'
import langXml from 'highlight.js/lib/languages/xml'
import langYaml from 'highlight.js/lib/languages/yaml'
import themeAtomOneDark from 'highlight.js/styles/atom-one-dark.css?inline'
import themeAtomOneLight from 'highlight.js/styles/atom-one-light.css?inline'
import themeGithub from 'highlight.js/styles/github.css?inline'
import themeGithubDark from 'highlight.js/styles/github-dark.css?inline'
import themeMonokai from 'highlight.js/styles/monokai.css?inline'
import themeNord from 'highlight.js/styles/nord.css?inline'
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
//only fonts that actually resolve: bundled via @fontsource, web-safe, or a
//css generic. anything else silently falls back and lies in the picker
const FONT_OPTIONS = [
  { label: 'System UI', value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Caladea', value: 'Caladea, Cambria, Georgia, serif' },
  { label: 'Carlito', value: 'Carlito, Calibri, Arial, sans-serif' },
  { label: 'Comic Sans', value: '"Comic Sans MS", "Comic Sans", cursive' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Impact', value: 'Impact, "Arial Narrow", sans-serif' },
  { label: 'Lato', value: 'Lato, Arial, sans-serif' },
  { label: 'Libre Baskerville', value: '"Libre Baskerville", Baskerville, Georgia, serif' },
  { label: 'Merriweather', value: 'Merriweather, Georgia, serif' },
  { label: 'Montserrat', value: 'Montserrat, Arial, sans-serif' },
  { label: 'Nunito', value: 'Nunito, Arial, sans-serif' },
  { label: 'Open Sans', value: '"Open Sans", Arial, sans-serif' },
  { label: 'Oswald', value: 'Oswald, Arial, sans-serif' },
  { label: 'Roboto', value: 'Roboto, Arial, sans-serif' },
  { label: 'Source Code Pro', value: '"Source Code Pro", monospace' },
  { label: 'Source Serif', value: '"Source Serif 4", Georgia, serif' },
  { label: 'Tahoma', value: 'Tahoma, Verdana, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Cursive', value: 'cursive' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'Sans Serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
]
const DEFAULT_FONT_VALUE = FONT_OPTIONS[0].value
const FONT_SIZES = ['8px', '9px', '10px', '11px', '12px', '14px', DEFAULT_FONT_SIZE, '18px', '20px', '24px', '28px', '32px', '36px', '48px', '72px']
const LINE_HEIGHTS = ['1', '1.15', '1.25', '1.5', '2', DEFAULT_LINE_HEIGHT, '28px', '32px']

//browsers normalize the inline font-family string (quoting, spacing, case), so
//matching against the whitelist needs both sides canonicalized first
function canonicalFont(value: string) {
  return value.replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim().toLowerCase()
}
const FONT_LOOKUP = new Map(FONT_OPTIONS.map((font) => [canonicalFont(font.value), font.value]))

//quill's stock font attributor compares the read-back font-family against the
//whitelist by exact string equality, so the quoting round-trip silently drops
//valid fonts. canonicalize before matching instead
class FontFamilyAttributor extends StyleAttributor {
  value(node: HTMLElement): string {
    const raw = node.style.fontFamily
    return (raw && FONT_LOOKUP.get(canonicalFont(raw))) || ''
  }

  canAdd(_node: HTMLElement, value: unknown): boolean {
    return typeof value === 'string' && FONT_LOOKUP.has(canonicalFont(value))
  }
}

//languages offered in the code-block picker, keys are hljs grammar names
//('plain' is quill's built-in no-highlight value)
const CODE_LANGUAGES = [
  { label: 'Plain', value: 'plain' },
  { label: 'Bash', value: 'bash' },
  { label: 'C', value: 'c' },
  { label: 'C++', value: 'cpp' },
  { label: 'C#', value: 'csharp' },
  { label: 'CSS', value: 'css' },
  { label: 'Go', value: 'go' },
  { label: 'HTML/XML', value: 'xml' },
  { label: 'Java', value: 'java' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'JSON', value: 'json' },
  { label: 'Kotlin', value: 'kotlin' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'PHP', value: 'php' },
  { label: 'Python', value: 'python' },
  { label: 'Ruby', value: 'ruby' },
  { label: 'Rust', value: 'rust' },
  { label: 'SQL', value: 'sql' },
  { label: 'Swift', value: 'swift' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'YAML', value: 'yaml' },
]

hljs.registerLanguage('bash', langBash)
hljs.registerLanguage('c', langC)
hljs.registerLanguage('cpp', langCpp)
hljs.registerLanguage('csharp', langCsharp)
hljs.registerLanguage('css', langCss)
hljs.registerLanguage('go', langGo)
hljs.registerLanguage('java', langJava)
hljs.registerLanguage('javascript', langJavascript)
hljs.registerLanguage('json', langJson)
hljs.registerLanguage('kotlin', langKotlin)
hljs.registerLanguage('markdown', langMarkdown)
hljs.registerLanguage('php', langPhp)
hljs.registerLanguage('python', langPython)
hljs.registerLanguage('ruby', langRuby)
hljs.registerLanguage('rust', langRust)
hljs.registerLanguage('sql', langSql)
hljs.registerLanguage('swift', langSwift)
hljs.registerLanguage('typescript', langTypescript)
hljs.registerLanguage('xml', langXml)
hljs.registerLanguage('yaml', langYaml)

//curated hljs themes, each scoped under its data-code-theme attribute so the
//raw stylesheets (which all target bare .hljs) can coexist
const CODE_THEMES = [
  { id: 'github-dark', label: 'GitHub Dark', css: themeGithubDark },
  { id: 'github', label: 'GitHub Light', css: themeGithub },
  { id: 'atom-one-dark', label: 'Atom One Dark', css: themeAtomOneDark },
  { id: 'atom-one-light', label: 'Atom One Light', css: themeAtomOneLight },
  { id: 'monokai', label: 'Monokai', css: themeMonokai },
  { id: 'nord', label: 'Nord', css: themeNord },
]
const DEFAULT_CODE_THEME = CODE_THEMES[0].id

//prefix every selector with the theme scope. hljs themes are flat rule lists,
//and their bare .hljs (the block itself) maps onto quill's code container
function scopeThemeCss(css: string, id: string) {
  const scope = `[data-code-theme="${id}"]`
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\})([^@{}]+)\{/g, (_, close: string, selectors: string) => {
      const scoped = selectors
        .split(',')
        .map((s) => {
          const sel = s.trim()
          if (!sel) return ''
          if (sel === '.hljs' || sel === 'pre code.hljs' || sel === 'code.hljs') {
            //match quill snow's own container rule specificity so the theme wins
            return `${scope} .ql-editor .ql-code-block-container`
          }
          return `${scope} ${sel.replace(/^(pre|code)\s+/, '').replace(/^code\./, '.')}`
        })
        .filter(Boolean)
        .join(', ')
      return `${close}${scoped}{`
    })
}

//inject all scoped themes once
if (typeof document !== 'undefined' && !document.getElementById('rte-code-themes')) {
  const style = document.createElement('style')
  style.id = 'rte-code-themes'
  style.textContent = CODE_THEMES.map((t) => scopeThemeCss(t.css, t.id)).join('\n')
  document.head.appendChild(style)
}

//per-language source validators, run debounced over each code block. an entry
//returns the first error message or null when the code parses
const JsxParser = Parser.extend(acornJsx())
function acornError(err: unknown) {
  return err instanceof Error ? err.message : 'syntax error'
}
const CODE_VALIDATORS: Partial<Record<string, (code: string) => string | null>> = {
  json: (code) => {
    try {
      JSON.parse(code)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'invalid JSON'
    }
  },
  javascript: (code) => {
    try {
      JsxParser.parse(code, { ecmaVersion: 'latest', sourceType: 'module' })
      return null
    } catch (err) {
      return acornError(err)
    }
  },
}

type QuillRange = { index: number; length: number }
type FormatValue = string | number | boolean
type FormatState = Record<string, FormatValue | FormatValue[] | undefined>
type EmbedPopoverType = 'link' | 'video' | 'formula'
type EmbedPopoverState = {
  type: EmbedPopoverType
  value: string
  //anchor point inside the editor content node, under the selection
  x: number
  y: number
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
  const FontStyle = new FontFamilyAttributor('font', 'font-family', {
    scope: Scope.INLINE,
  })
  //no whitelist: the size combos accept any typed value (e.g. 19px), a fixed
  //preset list would silently drop them
  const SizeStyle = Quill.import('attributors/style/size') as { whitelist?: string[] | null }
  const LineHeightStyle = new StyleAttributor('lineHeight', 'line-height', {
    scope: Scope.BLOCK,
  })
  SizeStyle.whitelist = null
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

//text targets outside the quill document that the toolbar also styles: the
//freeform canvas boxes and the page title
function activeExternalText() {
  const sel = window.getSelection()
  const node = sel?.anchorNode
  const el = node instanceof HTMLElement ? node : node?.parentElement
  const target = el?.closest?.('.canvas-box-text, .page-title-input') as HTMLElement | null
  if (!target) return null
  return { el: target, isTitle: target.classList.contains('page-title-input') }
}

function dispatchCanvasInput(box: HTMLElement) {
  box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatSetInlineTextDirection' }))
}

//apply a whole-element style to an external text target and nudge its owner
//to persist it (canvas boxes save on input, the title listens for title-style)
function styleExternalText(
  target: { el: HTMLElement; isTitle: boolean },
  prop: string,
  value: string,
) {
  target.el.style.setProperty(prop, value)
  if (target.isTitle) {
    target.el.dispatchEvent(new CustomEvent('title-style', { bubbles: true }))
  } else {
    dispatchCanvasInput(target.el)
  }
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

//searchable combo: an input that opens a filtering preset list, commits on
//Enter/blur (custom values allowed unless strict) or on picking an option
function SizeCombo({
  label,
  value,
  options,
  onCommit,
  strict = false,
  disabled = false,
  wide = false,
}: {
  label: string
  value: string
  options: { label: string; value: string }[]
  onCommit: (value: string) => void
  //strict: only option values are valid, unmatched text reverts (languages)
  strict?: boolean
  disabled?: boolean
  wide?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)
  const display = current?.label ?? value
  const [draft, setDraft] = useState(display)
  const [open, setOpen] = useState(false)
  const [filtering, setFiltering] = useState(false)

  //adopt the outside value whenever the combo is at rest
  useEffect(() => {
    if (!open) setDraft(display)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      setFiltering(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        setFiltering(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const query = draft.trim().toLowerCase()
  const shown =
    filtering && query
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query),
        )
      : options

  function commit(next: string) {
    setOpen(false)
    setFiltering(false)
    const text = next.trim()
    const match = options.find(
      (o) => o.value.toLowerCase() === text.toLowerCase() || o.label.toLowerCase() === text.toLowerCase(),
    )
    if (match) {
      onCommit(match.value)
    } else if (strict || !text) {
      setDraft(display)
    } else {
      onCommit(text)
    }
  }

  return (
    <Tooltip label={label}>
      <div ref={rootRef} className={`rte-combo${wide ? ' rte-combo-wide' : ''}`}>
        <input
          aria-label={label}
          className="rte-size-input"
          value={draft}
          disabled={disabled}
          onFocus={() => {
            setOpen(true)
            setFiltering(false)
          }}
          onChange={(event) => {
            setDraft(event.target.value)
            setOpen(true)
            setFiltering(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit(draft)
              event.currentTarget.blur()
            }
          }}
          onBlur={(event) => {
            if (rootRef.current?.contains(event.relatedTarget as Node | null)) return
            commit(draft)
          }}
        />
        {open && shown.length > 0 && (
          <div className="rte-font-popover rte-combo-popover" role="listbox">
            {shown.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={o.value === value ? 'is-selected' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </Tooltip>
  )
}

//plain dropdown menu (no typing), used for the code theme picker
function MenuSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { label: string; value: string }[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <Tooltip label={label}>
      <div
        className="rte-font-menu rte-menu-narrow"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
        }}
      >
        <button
          type="button"
          className="rte-font-trigger"
          aria-label={label}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen(!open)}
        >
          <span>{current.label}</span>
        </button>
        {open && (
          <div className="rte-font-popover" role="listbox">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={o.value === value ? 'is-selected' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                {o.label}
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
  const [codeTheme, setCodeTheme] = useState(DEFAULT_CODE_THEME)
  const [fontOpen, setFontOpen] = useState(false)
  const [embedPopover, setEmbedPopover] = useState<EmbedPopoverState>(null)

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
    const ext = activeExternalText()
    if (ext && !ext.isTitle) {
      document.execCommand(
        value === 'center' ? 'justifyCenter' : value === 'right' ? 'justifyRight' : 'justifyLeft',
      )
      ext.el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatSetBlockTextDirection' }))
      return
    }
    const editor = editorRef.current
    if (!editor) return
    const range = focusRange(editor)
    editor.formatLine(range.index, range.length, 'align', value, 'user')
    refreshState(editor)
  }

  function setFont(value: string) {
    const ext = activeExternalText()
    if (ext) {
      styleExternalText(ext, 'font-family', value)
      return
    }
    setInline('font', value || false)
  }

  function setFontSize(value: string) {
    const size = normalizeSize(value)
    const ext = activeExternalText()
    if (ext) {
      styleExternalText(ext, 'font-size', size)
      return
    }
    setInline('size', size === DEFAULT_FONT_SIZE ? false : size)
  }

  function setLineHeight(value: string) {
    const lineHeight = normalizeLineHeight(value)
    const ext = activeExternalText()
    if (ext) {
      styleExternalText(ext, 'line-height', lineHeight)
      return
    }
    const editor = editorRef.current
    if (!editor) return
    const range = focusRange(editor)
    editor.formatLine(range.index, range.length, 'lineHeight', lineHeight === DEFAULT_LINE_HEIGHT ? false : lineHeight, 'user')
    refreshState(editor)
  }

  function setColor(value: string) {
    const ext = activeExternalText()
    if (ext) {
      styleExternalText(ext, 'color', value)
      return
    }
    setInline('color', value)
  }

  function setHighlight(value: string) {
    const ext = activeExternalText()
    if (ext) {
      styleExternalText(ext, 'background-color', value)
      return
    }
    setInline('background', value)
  }

  function setCodeLanguage(lang: string) {
    const editor = editorRef.current
    if (!editor) return
    const range = focusRange(editor)
    editor.formatLine(range.index, range.length, 'code-block', lang, 'user')
    refreshState(editor)
  }

  //with the syntax module on, code-block's value is a language string, so the
  //generic value toggle in toggleLine would never turn it off
  function toggleCodeBlock() {
    const editor = editorRef.current
    if (!editor) return
    const range = focusRange(editor)
    const active = !!formatValue(editor.getFormat(range) as FormatState, 'code-block')
    editor.formatLine(range.index, range.length, 'code-block', active ? false : 'plain', 'user')
    refreshState(editor)
  }

  function openEmbedPopover(type: EmbedPopoverType) {
    const editor = editorRef.current
    const mount = mountRef.current
    if (!editor || !mount) return
    const range = focusRange(editor)
    const current = type === 'link' ? formatValue(editor.getFormat(range) as FormatState, 'link') : null
    //anchor the panel just under the selection, in content coordinates (bounds
    //are viewport-relative to the container, the canvas scrolls, so add scroll)
    const bounds = editor.getBounds(range.index, range.length)
    const x = Math.max(8, Math.min((bounds?.left ?? 0) + mount.scrollLeft, mount.clientWidth - 340))
    const y = (bounds?.bottom ?? 0) + mount.scrollTop + 6
    setEmbedPopover({
      type,
      value: typeof current === 'string' ? current : type === 'formula' ? 'e=mc^2' : 'https://',
      x,
      y,
    })
  }

  //normalize common video page urls into embeddable player urls, null when
  //the text is not a url at all
  function toVideoEmbedUrl(raw: string): string | null {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return null
    }
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === 'youtube.com') {
      const v = url.searchParams.get('v')
      if (url.pathname === '/watch' && v) return `https://www.youtube.com/embed/${v}`
      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/')[2]
        return id ? `https://www.youtube.com/embed/${id}` : null
      }
      if (url.pathname.startsWith('/embed/')) return raw
      return null
    }
    if (host === 'vimeo.com' && /^\/\d+/.test(url.pathname)) {
      return `https://player.vimeo.com/video${url.pathname}`
    }
    //anything else: trust the user pasted a real embed url
    return raw
  }

  function embedValidation(state: NonNullable<EmbedPopoverState>): string | null {
    const value = state.value.trim()
    if (!value) return state.type === 'link' ? null : 'enter a value'
    if (state.type === 'formula') {
      try {
        katex.renderToString(value, { throwOnError: true })
        return null
      } catch (err) {
        return err instanceof Error
          ? err.message.replace(/^KaTeX parse error:\s*/, '')
          : 'invalid formula'
      }
    }
    if (state.type === 'video') {
      return toVideoEmbedUrl(value) ? null : 'not a valid video URL'
    }
    return null
  }

  function applyEmbed() {
    if (!embedPopover || embedValidation(embedPopover)) return
    const editor = editorRef.current
    if (!editor) return
    const range = focusRange(editor)
    const value = embedPopover.value.trim()
    if (embedPopover.type === 'link') {
      if (range.length === 0 && value) {
        //nothing selected: insert the url itself as linked text
        editor.insertText(range.index, value, { link: value }, 'user')
        editor.setSelection(range.index + value.length, 0, 'silent')
      } else {
        editor.format('link', value || false, 'user')
      }
    } else if (value) {
      const embed = embedPopover.type === 'video' ? toVideoEmbedUrl(value)! : value
      editor.insertEmbed(range.index, embedPopover.type, embed, 'user')
      editor.setSelection(range.index + 1, 0, 'silent')
    }
    setEmbedPopover(null)
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
        syntax: {
          hljs,
          languages: CODE_LANGUAGES.map(({ label, value }) => ({ key: value, label })),
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
    //run each code block through its language's validator (if any) and pin the
    //first error to the block as a data attribute the css renders as a banner
    const validateCodeBlocks = () => {
      editor.root.querySelectorAll<HTMLElement>('.ql-code-block-container').forEach((container) => {
        const lines = Array.from(container.querySelectorAll<HTMLElement>('.ql-code-block'))
        const lang = lines[0]?.getAttribute('data-language') ?? 'plain'
        const validator = CODE_VALIDATORS[lang]
        const code = lines.map((l) => l.textContent ?? '').join('\n')
        const error = validator && code.trim() ? validator(code) : null
        if (error) container.setAttribute('data-code-error', error)
        else container.removeAttribute('data-code-error')
      })
    }
    let validateTimer: number | undefined
    const scheduleValidate = () => {
      window.clearTimeout(validateTimer)
      //slightly behind the syntax module's re-highlight so the attribute isn't
      //applied to nodes it is about to replace
      validateTimer = window.setTimeout(validateCodeBlocks, 1200)
    }
    scheduleValidate()
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
    editor.on('text-change', scheduleValidate)
    editor.on('editor-change', onEditorChange)
    editor.root.addEventListener('pointerdown', closeFromEditor)
    editor.root.addEventListener('keydown', keepInlineFormatsOnEnter)
    document.addEventListener('pointerdown', closeFromOutside)
    refreshState(editor)

    return () => {
      window.clearTimeout(saveTimer.current)
      window.clearTimeout(validateTimer)
      editor.off('text-change', scheduleSave)
      editor.off('text-change', scheduleValidate)
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
  const fontSize = String(formatValue(formats, 'size') ?? DEFAULT_FONT_SIZE)
  const lineHeight = String(formatValue(formats, 'lineHeight') ?? DEFAULT_LINE_HEIGHT)
  const codeBlockValue = formatValue(formats, 'code-block')
  const inCodeBlock = codeBlockValue !== undefined && codeBlockValue !== false
  const codeLang = typeof codeBlockValue === 'string' ? codeBlockValue : 'plain'
  const embedError = embedPopover ? embedValidation(embedPopover) : null
  const formulaPreview =
    embedPopover?.type === 'formula' && !embedError && embedPopover.value.trim()
      ? katex.renderToString(embedPopover.value.trim(), { throwOnError: false })
      : ''

  return (
    <>
      <div className="quill-editor-shell" data-code-theme={codeTheme}>
      <div ref={toolbarRef} className="rte-toolbar">
        <span className="ql-formats">
          <FontSelect
            label="Font family"
            value={font || DEFAULT_FONT_VALUE}
            onChange={setFont}
            open={fontOpen}
            onOpenChange={setFontOpen}
          />
          <SizeCombo
            label="Font size"
            value={fontSize}
            options={FONT_SIZES.map((size) => ({ label: size, value: size }))}
            onCommit={setFontSize}
          />
          <SizeCombo
            label="Line spacing"
            value={lineHeight}
            options={LINE_HEIGHTS.map((lh) => ({ label: lh, value: lh }))}
            onCommit={setLineHeight}
          />
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
          <ToolbarColor label="Text color" value={color} onChange={setColor}>
            <FontColorIcon color={color} />
          </ToolbarColor>
          <ToolbarColor label="Highlight color" value={background} onChange={setHighlight}>
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
          <ToolbarButton label="Code block" active={inCodeBlock} onClick={toggleCodeBlock}>
            <Code className="size-4" aria-hidden />
          </ToolbarButton>
          <SizeCombo
            label="Code language"
            value={codeLang}
            options={CODE_LANGUAGES}
            onCommit={setCodeLanguage}
            strict
            wide
            disabled={!inCodeBlock}
          />
          <MenuSelect
            label="Code theme"
            value={codeTheme}
            options={CODE_THEMES.map(({ id, label }) => ({ label, value: id }))}
            onChange={setCodeTheme}
          />
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
          <ToolbarButton label="Link" shortcut="Cmd/Ctrl+K" active={!!formats.link} onClick={() => openEmbedPopover('link')}>
            <Link className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Video embed" onClick={() => openEmbedPopover('video')}>
            <Video className="size-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton label="Math formula" onClick={() => openEmbedPopover('formula')}>
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
        </span>
        <span className="sr-only" aria-live="polite">
          Undo {historyState.undo ? 'available' : 'unavailable'}, redo {historyState.redo ? 'available' : 'unavailable'}
        </span>
      </div>
        <div ref={mountRef} className="rte-content" />
      </div>
      {embedPopover &&
        mountRef.current &&
        createPortal(
          <div
            className="rte-embed-popover"
            style={{ left: embedPopover.x, top: embedPopover.y }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEmbedPopover(null)
            }}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault()
                applyEmbed()
              }}
            >
              <input
                autoFocus
                aria-label={embedPopover.type === 'formula' ? 'Formula' : 'URL'}
                value={embedPopover.value}
                placeholder={embedPopover.type === 'formula' ? 'e=mc^2' : 'https://example.com'}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) =>
                  setEmbedPopover((current) =>
                    current ? { ...current, value: event.target.value } : current,
                  )
                }
              />
              {embedPopover.type === 'formula' && formulaPreview && (
                <div
                  className="rte-embed-preview"
                  dangerouslySetInnerHTML={{ __html: formulaPreview }}
                />
              )}
              {embedError && embedPopover.value.trim() !== '' && (
                <div className="rte-embed-error">{embedError}</div>
              )}
              <div className="rte-embed-actions">
                <button type="button" onClick={() => setEmbedPopover(null)}>
                  Cancel
                </button>
                <button type="submit" disabled={!!embedError}>
                  {embedPopover.type === 'link' ? 'Apply' : 'Insert'}
                </button>
              </div>
            </form>
          </div>,
          mountRef.current,
        )}
    </>
  )
}
