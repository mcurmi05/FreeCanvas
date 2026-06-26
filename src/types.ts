//the local folder the user picked, a collection of notebooks
export interface LibraryRef {
  id: string
  name: string
  handle: FileSystemDirectoryHandle
  lastOpened: number
}

//a notebook is a subfolder inside a library
export interface NotebookEntry {
  name: string
  handle: FileSystemDirectoryHandle
}

//a page holds rich text, a group is just a container for child pages
export type PageKind = 'page' | 'group'

//a node in a notebook's page tree
//pages are html files, anything with children is backed by a subdirectory
//  - leaf page  -> Name.html
//  - page+kids  -> Name/ with index.html (its own content) plus children
//  - group      -> Name/ with no index.html, only children
export interface PageNode {
  name: string //base name, no extension
  path: string //slash path under the notebook, unique id
  kind: PageKind
  depth: number //nesting level, drives sidebar indent
  fileHandle?: FileSystemFileHandle //the html content, pages only
  dirHandle?: FileSystemDirectoryHandle //the backing folder, groups and page+kids
  children: PageNode[]
}
