/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

//permission bits of the file system access api are not in lib.dom yet
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>
  requestPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>
}

type FileSystemEntryHandle = FileSystemFileHandle | FileSystemDirectoryHandle

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemEntryHandle]>
  keys(): AsyncIterableIterator<string>
  values(): AsyncIterableIterator<FileSystemEntryHandle>
}

interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: FileSystemHandle | string
}

interface Window {
  showDirectoryPicker(
    options?: DirectoryPickerOptions,
  ): Promise<FileSystemDirectoryHandle>
}

//drag and drop entry point to a file system handle, not in lib.dom yet
interface DataTransferItem {
  getAsFileSystemHandle(): Promise<FileSystemHandle | null>
}
