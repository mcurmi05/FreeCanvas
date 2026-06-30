import { useEffect, useMemo, useRef, useState } from 'react'
import RichTextEditor from 'reactjs-tiptap-editor'
import { BaseKit } from 'reactjs-tiptap-editor/base-kit'
import { FontFamily } from 'reactjs-tiptap-editor/fontfamily'
import { FontSize } from 'reactjs-tiptap-editor/fontsize'
import { LineHeight } from 'reactjs-tiptap-editor/lineheight'
import { TextAlign } from 'reactjs-tiptap-editor/textalign'
import { Bold } from 'reactjs-tiptap-editor/bold'
import { Italic } from 'reactjs-tiptap-editor/italic'
import { TextUnderline } from 'reactjs-tiptap-editor/textunderline'
import { Strike } from 'reactjs-tiptap-editor/strike'
import { Color } from 'reactjs-tiptap-editor/color'
import { Highlight } from 'reactjs-tiptap-editor/highlight'
import { BulletList } from 'reactjs-tiptap-editor/bulletlist'
import { OrderedList } from 'reactjs-tiptap-editor/orderedlist'
import { Indent } from 'reactjs-tiptap-editor/indent'
import { Link } from 'reactjs-tiptap-editor/link'
import { History } from 'reactjs-tiptap-editor/history'
import { Clear } from 'reactjs-tiptap-editor/clear'
import { HorizontalRule } from 'reactjs-tiptap-editor/horizontalrule'
import { Blockquote } from 'reactjs-tiptap-editor/blockquote'
import 'reactjs-tiptap-editor/style.css'

const DEFAULT_FONT_FAMILY = 'Arial'
const DEFAULT_FONT_SIZE = '16px'
const DEFAULT_LINE_HEIGHT = '24px'

const FONT_FAMILIES = [
 DEFAULT_FONT_FAMILY,
 'Georgia',
 'Times New Roman',
 'Verdana',
 'Courier New',
]

const FONT_SIZES = [
 '10px',
 '11px',
 '12px',
 '14px',
 DEFAULT_FONT_SIZE,
 '18px',
 '20px',
 '22px',
 '24px',
 '26px',
 '28px',
 '36px',
 '48px',
 '72px',
]

const LINE_HEIGHTS = [
 '16px',
 '18px',
 '20px',
 DEFAULT_LINE_HEIGHT,
 '28px',
 '32px',
 '36px',
 '40px',
 '48px',
]

//minimal slice of the tiptap editor we poll for toolbar undo/redo availability
export interface EditorCan {
 can: () => { undo: () => boolean; redo: () => boolean }
}

type ToolbarEditor = EditorCan & {
 getAttributes: (name: string) => Record<string, string | null | undefined>
 chain: () => {
  focus: () => {
   setFontFamily: (value: string) => { run: () => boolean }
   unsetFontFamily: () => { run: () => boolean }
   setFontSize: (value: string) => { run: () => boolean }
   unsetFontSize: () => { run: () => boolean }
   setLineHeight: (value: string) => { run: () => boolean }
   unsetLineHeight: () => { run: () => boolean }
  }
 }
 on?: (event: string, cb: () => void) => void
 off?: (event: string, cb: () => void) => void
}

function useEditorTick(editor: ToolbarEditor) {
 const [, setTick] = useState(0)

 useEffect(() => {
  const bump = () => setTick((n) => n + 1)
  editor.on?.('selectionUpdate', bump)
  editor.on?.('transaction', bump)
  editor.on?.('update', bump)
  bump()
  return () => {
   editor.off?.('selectionUpdate', bump)
   editor.off?.('transaction', bump)
   editor.off?.('update', bump)
  }
 }, [editor])
}

function ToolbarSelect({
 label,
 value,
 options,
 onChange,
 className = '',
}: {
 label: string
 value: string
 options: string[]
 onChange: (value: string) => void
 className?: string
}) {
 return (
  <label className="richtext-inline-flex richtext-items-center">
   <span className="sr-only">{label}</span>
   <select
    aria-label={label}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`rte-toolbar-select ${className}`}
   >
    {options.map((option) => (
     <option key={option} value={option}>
      {option}
     </option>
    ))}
   </select>
  </label>
 )
}

function FontFamilySelect({ editor }: { editor: ToolbarEditor }) {
 useEditorTick(editor)
 const value = editor.getAttributes('textStyle').fontFamily ?? DEFAULT_FONT_FAMILY

 return (
  <ToolbarSelect
   label="Font family"
   value={value}
   options={FONT_FAMILIES}
   className="rte-toolbar-select-family"
   onChange={(next) => {
    const chain = editor.chain().focus()
    if (next === DEFAULT_FONT_FAMILY) chain.unsetFontFamily().run()
    else chain.setFontFamily(next).run()
   }}
  />
 )
}

function FontSizeSelect({ editor }: { editor: ToolbarEditor }) {
 useEditorTick(editor)
 const value = editor.getAttributes('textStyle').fontSize ?? DEFAULT_FONT_SIZE

 return (
  <ToolbarSelect
   label="Font size"
   value={value}
   options={FONT_SIZES}
   className="rte-toolbar-select-size"
   onChange={(next) => {
    const chain = editor.chain().focus()
    if (next === DEFAULT_FONT_SIZE) chain.unsetFontSize().run()
    else chain.setFontSize(next).run()
   }}
  />
 )
}

function LineHeightSelect({ editor }: { editor: ToolbarEditor }) {
 useEditorTick(editor)
 const value = editor.getAttributes('paragraph').lineHeight ?? DEFAULT_LINE_HEIGHT

 return (
  <ToolbarSelect
   label="Line spacing"
   value={value}
   options={LINE_HEIGHTS}
   className="rte-toolbar-select-line"
   onChange={(next) => {
    const chain = editor.chain().focus()
    if (next === DEFAULT_LINE_HEIGHT) chain.unsetLineHeight().run()
    else chain.setLineHeight(next).run()
   }}
  />
 )
}

interface Props {
  content: string
  onSave: (html: string) => void
  //receives the live editor (or null on teardown) so the canvas can ask whether
  //the document itself still has anything to undo/redo
  editorOut?: { current: EditorCan | null }
}

//word style toolbar editor, forked off reactjs-tiptap-editor (MIT)
//the page that mounts this should key it by page so switching reloads content
export function PageEditor({ content, onSave, editorOut }: Props) {
  const timer = useRef<number | undefined>(undefined)

  //the toolbar features, font family, size and line height give the word feel
  const extensions = useMemo(
    () => [
      BaseKit.configure({
        //no placeholder text, a blank document like word
        placeholder: false,
        //drop the character and word count footer bar
        characterCount: false,
      }),
      History,
      Clear,
 FontFamily.configure({
 fontFamilyList: FONT_FAMILIES,
 button({ editor }) {
 return {
 component: FontFamilySelect,
 componentProps: { editor },
 }
 },
 }),
 FontSize.configure({
 fontSizes: FONT_SIZES,
 button({ editor }) {
 return {
 component: FontSizeSelect,
 componentProps: { editor },
 }
 },
 }),
 LineHeight.configure({
 defaultHeight: DEFAULT_LINE_HEIGHT,
 lineHeights: LINE_HEIGHTS,
 button({ editor }) {
 return {
 component: LineHeightSelect,
 componentProps: { editor },
 }
 },
 }),
      Bold,
      Italic,
      TextUnderline,
      Strike,
      Color,
      Highlight,
      TextAlign.configure({ types: ['paragraph'] }),
      BulletList,
      OrderedList,
      Indent,
      Blockquote,
      HorizontalRule,
      Link,
    ],
    [],
  )

  //debounce writes so we are not hitting disk on every keystroke
  function handleChange(value: unknown) {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onSave(String(value)), 600)
  }

  return (
    <RichTextEditor
      //callback ref dodges the component's exact ref type, just publish the
      //live editor instance to the canvas (null on unmount)
      ref={(inst: { editor: EditorCan | null } | null) => {
        if (editorOut) editorOut.current = inst?.editor ?? null
      }}
      output="html"
      content={content}
      extensions={extensions}
      onChangeContent={handleChange}
      contentClass="rte-content"
      dark={false}
      />
  )
}
