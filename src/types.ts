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
