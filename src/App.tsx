import { Navigate, Route, Routes } from 'react-router-dom'
import { LaunchScreen } from '@/screens/LaunchScreen'
import { LibraryScreen } from '@/screens/LibraryScreen'
import { NotebookScreen } from '@/screens/NotebookScreen'
import { RequireLibrary, RequireNotebook } from '@/routes/RequireLibrary'
import { paths } from '@/routes/paths'

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
            <NotebookScreen />
          </RequireNotebook>
        }
      />
      <Route path="*" element={<Navigate to={paths.launch} replace />} />
    </Routes>
  )
}
