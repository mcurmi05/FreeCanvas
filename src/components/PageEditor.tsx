import { useMemo, useRef } from 'react'
import RichTextEditor from 'reactjs-tiptap-editor'
import { BaseKit } from 'reactjs-tiptap-editor/base-kit'
import { Heading } from 'reactjs-tiptap-editor/heading'
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

interface Props {
  content: string
  onSave: (html: string) => void
}

//word style toolbar editor, forked off reactjs-tiptap-editor (MIT)
//the page that mounts this should key it by page so switching reloads content
export function PageEditor({ content, onSave }: Props) {
  const timer = useRef<number | undefined>(undefined)

  //the toolbar features, font family, size and line height give the word feel
  const extensions = useMemo(
    () => [
      BaseKit.configure({
        placeholder: { showOnlyCurrent: true, placeholder: 'write something…' },
      }),
      History,
      Clear,
      Heading,
      FontFamily,
      FontSize,
      LineHeight,
      Bold,
      Italic,
      TextUnderline,
      Strike,
      Color,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
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
      output="html"
      content={content}
      extensions={extensions}
      onChangeContent={handleChange}
      contentClass="rte-content"
      dark={false}
    />
  )
}
