import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LaunchScreen } from '@/screens/LaunchScreen'
import { LibraryScreen } from '@/screens/LibraryScreen'
import { RequireLibrary, RequireNotebook } from '@/routes/RequireLibrary'
import { paths } from '@/routes/paths'

//editor is heavy, only load it when a notebook is opened
const NotebookScreen = lazy(() =>
  import('@/screens/NotebookScreen').then((m) => ({ default: m.NotebookScreen })),
)

export default function App() {
  return (
    <Routes>
      <Route path={paths.launch} element={<LaunchScreen />} />
      <Route
        path={paths.libraryPattern}
        element={
          <RequireLibrary>
            <LibraryScreen />
          </RequireLibrary>
        }
      />
      <Route
        path={paths.notebookPattern}
        element={
          <RequireNotebook>
            <Suspense fallback={<EditorFallback />}>
              <NotebookScreen />
            </Suspense>
          </RequireNotebook>
        }
      />
      <Route path="*" element={<Navigate to={paths.launch} replace />} />
    </Routes>
  )
}

function EditorFallback() {
  return (
    <div className="grid h-dvh place-items-center text-sm text-muted-foreground">
      loading editor…
    </div>
  )
}
