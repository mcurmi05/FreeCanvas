import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Indent,
  Outdent,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import type { DropPosition } from '@/store/appStore'
import { PageEditor } from '@/components/PageEditor'
import { NewEntryDialog } from '@/components/NewEntryDialog'
import { Button } from '@/components/ui/button'
import { paths } from '@/routes/paths'
import { cn } from '@/lib/utils'
import type { PageKind, PageNode } from '@/types'

const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 520
const SIDEBAR_DEFAULT = 256
const WIDTH_KEY = 'sidebar-width'
const COLLAPSED_KEY = 'sidebar-collapsed'

//what the open context menu points at, null target means the notebook root
interface MenuState {
  x: number
  y: number
  node: PageNode | null
}

//shared handlers threaded through the recursive tree
interface TreeContext {
  openMenu: (e: React.MouseEvent, node: PageNode | null) => void
  draggingPath: string | null
  setDraggingPath: (path: string | null) => void
}

const TreeCtx = createContext<TreeContext | null>(null)

//notebook workspace, pages sidebar tree plus the word style page editor
export function NotebookScreen() {
  const navigate = useNavigate()
  const library = useAppStore((s) => s.library)
  const activeNotebook = useAppStore((s) => s.activeNotebook)
  const pageTree = useAppStore((s) => s.pageTree)
  const activePage = useAppStore((s) => s.activePage)
  const pageContent = useAppStore((s) => s.pageContent)
  const saveState = useAppStore((s) => s.saveState)
  const savePage = useAppStore((s) => s.savePage)
  const closeNotebook = useAppStore((s) => s.closeNotebook)
  const moveNode = useAppStore((s) => s.moveNode)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dialog, setDialog] = useState<{ kind: PageKind; parentPath?: string } | null>(
    null,
  )
  const [draggingPath, setDraggingPath] = useState<string | null>(null)

  //sidebar width and collapsed state survive reloads
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : SIDEBAR_DEFAULT
  })
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === '1',
  )

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width))
  }, [width])
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  function handleBack() {
    closeNotebook()
    if (library) navigate(paths.library(library.name))
  }

  function openMenu(e: React.MouseEvent, node: PageNode | null) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, node })
  }

  //drag the divider to resize, listeners live only while dragging
  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    function onMove(ev: PointerEvent) {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + ev.clientX - startX))
      setWidth(next)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  //drop onto the empty sidebar area moves the dragged node to the root
  function onRootDrop(e: React.DragEvent) {
    const source = e.dataTransfer.getData('text/plain') || draggingPath
    setDraggingPath(null)
    if (source) moveNode(source, null, 'inside')
  }

  return (
    <div className="flex h-dvh">
      {!collapsed && (
        <aside
          className="flex shrink-0 flex-col border-r border-border"
          style={{ width }}
          onContextMenu={(e) => openMenu(e, null)}
        >
          {/*sidebar header, nav lives here so the editor can own the top bar*/}
          <div className="flex items-center gap-2 border-b border-border px-2 py-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              aria-label="back to library"
            >
              <ChevronLeft />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold tracking-tight">
                {activeNotebook?.name}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {saveState === 'saving'
                  ? 'saving…'
                  : saveState === 'saved'
                    ? 'saved'
                    : library?.name}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(true)}
              aria-label="collapse sidebar"
            >
              <PanelLeftClose />
            </Button>
          </div>

          <div className="flex gap-2 px-2 pb-2 pt-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => setDialog({ kind: 'page' })}
            >
              <FilePlus aria-hidden />
              Page
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setDialog({ kind: 'group' })}
            >
              <FolderPlus aria-hidden />
              Group
            </Button>
          </div>

          <TreeCtx.Provider value={{ openMenu, draggingPath, setDraggingPath }}>
            <div
              className="min-h-12 flex-1 overflow-y-auto px-2 pb-3"
              //let the empty area accept drops back to the root level
              onDragOver={(e) => {
                if (draggingPath) e.preventDefault()
              }}
              onDrop={onRootDrop}
            >
              {pageTree.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">no pages yet</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {pageTree.map((node) => (
                    <PageTreeItem key={node.path} node={node} />
                  ))}
                </ul>
              )}
            </div>
          </TreeCtx.Provider>
        </aside>
      )}

      {/*resize divider*/}
      {!collapsed && (
        <div
          onPointerDown={startResize}
          className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-border"
          role="separator"
          aria-orientation="vertical"
          aria-label="resize sidebar"
        />
      )}

      {/*editor area, fills the full height, its toolbar is the top bar*/}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {collapsed && (
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(false)}
              aria-label="open sidebar"
            >
              <PanelLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              aria-label="back to library"
            >
              <ChevronLeft />
            </Button>
            <span className="truncate text-sm font-medium">
              {activePage?.name ?? activeNotebook?.name}
            </span>
          </div>
        )}

        {activePage ? (
          <div className="editor-fill min-h-0 flex-1">
            <PageEditor key={activePage.path} content={pageContent} onSave={savePage} />
          </div>
        ) : (
          <div className="grid flex-1 place-items-center p-10 text-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileText className="size-8" aria-hidden />
              <p className="text-sm">
                {pageTree.length === 0
                  ? 'create a page to start writing'
                  : 'select a page'}
              </p>
            </div>
          </div>
        )}
      </main>

      {menu && (
        <SidebarMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onNew={(kind, parentPath) => setDialog({ kind, parentPath })}
        />
      )}

      {dialog && (
        <NewEntryDialog
          kind={dialog.kind}
          parentPath={dialog.parentPath}
          open
          onOpenChange={(open) => !open && setDialog(null)}
        />
      )}
    </div>
  )
}

//floating right click menu for a node, or for the root when node is null
function SidebarMenu({
  menu,
  onClose,
  onNew,
}: {
  menu: MenuState
  onClose: () => void
  onNew: (kind: PageKind, parentPath?: string) => void
}) {
  const makeSubpage = useAppStore((s) => s.makeSubpage)
  const promotePage = useAppStore((s) => s.promotePage)
  const node = menu.node

  //dismiss on any outside click or escape
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  function run(action: () => void) {
    action()
    onClose()
  }

  const parentPath = node?.path

  return (
    <div
      role="menu"
      className="fixed z-50 min-w-44 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
      style={{ left: menu.x, top: menu.y }}
      //keep clicks inside from bubbling to the dismiss listener
      onPointerDown={(e) => e.stopPropagation()}
    >
      <MenuItem icon={FilePlus} onClick={() => run(() => onNew('page', parentPath))}>
        {node ? 'Add page inside' : 'New page'}
      </MenuItem>
      <MenuItem icon={FolderPlus} onClick={() => run(() => onNew('group', parentPath))}>
        {node ? 'Add group inside' : 'New group'}
      </MenuItem>
      {node && (
        <>
          <div className="my-1 h-px bg-border" />
          <MenuItem icon={Indent} onClick={() => run(() => makeSubpage(node.path))}>
            Make subpage
          </MenuItem>
          <MenuItem icon={Outdent} onClick={() => run(() => promotePage(node.path))}>
            Promote page
          </MenuItem>
        </>
      )}
    </div>
  )
}

function MenuItem({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof FilePlus
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {children}
    </button>
  )
}

//one row in the sidebar tree, recurses into its children
function PageTreeItem({ node }: { node: PageNode }) {
  const ctx = useContext(TreeCtx)!
  const activePage = useAppStore((s) => s.activePage)
  const openPage = useAppStore((s) => s.openPage)
  const moveNode = useAppStore((s) => s.moveNode)
  const [collapsed, setCollapsed] = useState(false)
  //the live drop position while a drag hovers this row, null when not hovered
  const [dropPos, setDropPos] = useState<DropPosition | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const hasChildren = node.children.length > 0
  const isActive = activePage?.path === node.path
  const Icon = node.kind === 'group' ? Folder : FileText

  //a drag is only a valid target when it is not the node itself or a descendant
  const dragging = ctx.draggingPath
  const isValid =
    !!dragging && dragging !== node.path && !node.path.startsWith(dragging + '/')

  function onRowClick() {
    if (node.kind === 'page') openPage(node)
    else if (hasChildren) setCollapsed((c) => !c)
  }

  //the top and bottom quarters reorder, the middle band nests inside
  function onDragOver(e: React.DragEvent) {
    if (!isValid) return
    e.preventDefault()
    e.stopPropagation()
    const rect = rowRef.current!.getBoundingClientRect()
    const y = e.clientY - rect.top
    setDropPos(y < rect.height * 0.25 ? 'before' : y > rect.height * 0.75 ? 'after' : 'inside')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const source = e.dataTransfer.getData('text/plain') || dragging
    const pos = dropPos
    setDropPos(null)
    ctx.setDraggingPath(null)
    if (source && isValid && pos) moveNode(source, node.path, pos)
  }

  return (
    <li>
      <div className="relative">
        {/*reorder indicators, a line above or below the row*/}
        {dropPos === 'before' && (
          <span className="pointer-events-none absolute inset-x-1 -top-px z-10 h-0.5 rounded bg-ring" />
        )}
        {dropPos === 'after' && (
          <span className="pointer-events-none absolute inset-x-1 -bottom-px z-10 h-0.5 rounded bg-ring" />
        )}
        <div
          ref={rowRef}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', node.path)
            e.dataTransfer.effectAllowed = 'move'
            ctx.setDraggingPath(node.path)
          }}
          onDragEnd={() => {
            ctx.setDraggingPath(null)
            setDropPos(null)
          }}
          onDragOver={onDragOver}
          onDragLeave={() => setDropPos(null)}
          onDrop={onDrop}
          onContextMenu={(e) => ctx.openMenu(e, node)}
          className={cn(
            'group flex items-center rounded-md pr-1 transition-colors hover:bg-accent',
            isActive && 'bg-accent',
            dropPos === 'inside' && 'ring-2 ring-inset ring-ring',
          )}
          //indent by nesting depth
          style={{ paddingLeft: node.depth * 14 }}
        >
          {/*expand toggle, reserved space even when there are no children*/}
          <button
            onClick={() => hasChildren && setCollapsed((c) => !c)}
            className="grid size-5 shrink-0 place-items-center text-muted-foreground"
            aria-label={collapsed ? 'expand' : 'collapse'}
            tabIndex={hasChildren ? 0 : -1}
          >
            {hasChildren && (
              <ChevronRight
                className={cn(
                  'size-3.5 transition-transform duration-200',
                  !collapsed && 'rotate-90',
                )}
                aria-hidden
              />
            )}
          </button>

          <button
            onClick={onRowClick}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm outline-none',
              isActive && 'font-medium',
            )}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{node.name}</span>
          </button>
        </div>
      </div>

      {/*children animate open and closed via a collapsing grid row*/}
      {hasChildren && (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
          )}
        >
          <ul className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
            {node.children.map((child) => (
              <PageTreeItem key={child.path} node={child} />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}
