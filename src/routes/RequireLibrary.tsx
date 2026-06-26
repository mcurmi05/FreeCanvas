import { Navigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { paths } from './paths'

//guard for routes that need an open library
//direct hits or refreshes with no in-memory library bounce to launch
export function RequireLibrary({ children }: { children: React.ReactNode }) {
  const library = useAppStore((s) => s.library)
  if (!library) return <Navigate to={paths.launch} replace />
  return <>{children}</>
}

//guard for the notebook route, needs a library and an active notebook
export function RequireNotebook({ children }: { children: React.ReactNode }) {
  const library = useAppStore((s) => s.library)
  const activeNotebook = useAppStore((s) => s.activeNotebook)
  if (!library) return <Navigate to={paths.launch} replace />
  if (!activeNotebook) return <Navigate to={paths.library(library.name)} replace />
  return <>{children}</>
}
