//central route table, import these instead of hardcoding url strings
export const paths = {
  launch: '/',
  //url reflects the open library by its folder name
  library: (name: string) => `/library/${encodeURIComponent(name)}`,
  libraryPattern: '/library/:library',
  //a notebook inside a library
  notebook: (library: string, notebook: string) =>
    `/library/${encodeURIComponent(library)}/notebook/${encodeURIComponent(notebook)}`,
  notebookPattern: '/library/:library/notebook/:notebook',
} as const
