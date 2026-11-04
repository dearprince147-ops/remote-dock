import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  Copy,
  Download,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
  UploadCloud
} from 'lucide-react'
import type { FileEntry } from '@shared/types'
import { useAppStore } from '../store/appStore'
import { useExplorerStore, visibleEntries } from '../store/explorerStore'
import { Sidebar } from '../components/explorer/Sidebar'
import { InfoBar } from '../components/explorer/InfoBar'
import { FileList } from '../components/explorer/FileList'
import { FileGrid } from '../components/explorer/FileGrid'
import { ContextMenu, type MenuItem } from '../components/ContextMenu'

interface MenuState {
  x: number
  y: number
  entry: FileEntry
}

export function ExplorerPage(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const activeDeviceId = useAppStore((state) => state.activeDeviceId)

  const deviceId = useExplorerStore((state) => state.deviceId)
  const path = useExplorerStore((state) => state.path)
  const entries = useExplorerStore((state) => state.entries)
  const loading = useExplorerStore((state) => state.loading)
  const error = useExplorerStore((state) => state.error)
  const selection = useExplorerStore((state) => state.selection)
  const anchor = useExplorerStore((state) => state.anchor)
  const filter = useExplorerStore((state) => state.filter)

  const open = useExplorerStore((state) => state.open)
  const load = useExplorerStore((state) => state.load)
  const refresh = useExplorerStore((state) => state.refresh)
  const navigate = useExplorerStore((state) => state.navigate)
  const setSelection = useExplorerStore((state) => state.setSelection)
  const setSort = useExplorerStore((state) => state.setSort)
  const downloadSelected = useExplorerStore((state) => state.downloadSelected)
  const downloadTo = useExplorerStore((state) => state.downloadTo)
  const downloadEntry = useExplorerStore((state) => state.downloadEntry)
  const newFolder = useExplorerStore((state) => state.newFolder)
  const renameSelected = useExplorerStore((state) => state.renameSelected)
  const deleteSelected = useExplorerStore((state) => state.deleteSelected)
  const copyPath = useExplorerStore((state) => state.copyPath)
  const uploadPaths = useExplorerStore((state) => state.uploadPaths)

  const [collapsed, setCollapsed] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    if (activeDeviceId) void open(activeDeviceId)
  }, [activeDeviceId, open])

  useEffect(() => {
    if (!activeDeviceId || deviceId !== activeDeviceId) {
      setCollapsed(false)
      setMenu(null)
    }
  }, [activeDeviceId, deviceId])

  const openEntry = useCallback(
    (entry: FileEntry) => {
      if (entry.isDir) void navigate(entry.path)
      else void downloadEntry(entry)
    },
    [downloadEntry, navigate]
  )

  const ensureSelected = useCallback(
    (entry: FileEntry) => {
      if (!selection.includes(entry.path)) setSelection([entry.path], entry.path)
    },
    [selection, setSelection]
  )

  const menuItems = useCallback(
    (entry: FileEntry): MenuItem[] => {
      const multi = selection.length > 1 && selection.includes(entry.path)
      return [
        {
          label: entry.isDir ? 'Open' : 'Download',
          icon: entry.isDir ? FolderOpen : Download,
          onClick: () => openEntry(entry)
        },
        {
          label: multi ? `Download ${selection.length} items` : 'Download',
          icon: Download,
          shortcut: 'Ctrl+D',
          onClick: () => {
            ensureSelected(entry)
            void downloadSelected()
          }
        },
        {
          label: 'Download to…',
          icon: FolderInput,
          onClick: () => {
            ensureSelected(entry)
            void downloadTo()
          }
        },
        { separator: true },
        {
          label: 'New folder',
          icon: FolderPlus,
          shortcut: 'Ctrl+Shift+N',
          onClick: () => void newFolder()
        },
        {
          label: 'Rename',
          icon: Pencil,
          shortcut: 'F2',
          disabled: multi,
          onClick: () => {
            ensureSelected(entry)
            void renameSelected()
          }
        },
        {
          label: multi ? `Delete ${selection.length} items` : 'Delete',
          icon: Trash2,
          shortcut: 'Del',
          danger: true,
          onClick: () => {
            ensureSelected(entry)
            void deleteSelected()
          }
        },
        {
          label: 'Copy path',
          icon: Copy,
          onClick: () => void copyPath(entry.path)
        },
        { separator: true },
        { label: 'Refresh', icon: RefreshCw, shortcut: 'F5', onClick: () => void refresh() }
      ]
    },
    [copyPath, deleteSelected, downloadSelected, downloadTo, ensureSelected, newFolder, openEntry, refresh, renameSelected, selection]
  )

  const onDragEnter = (event: React.DragEvent): void => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  const onDragOver = (event: React.DragEvent): void => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave = (): void => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const onDrop = (event: React.DragEvent): void => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    const paths = files.map((file) => window.api.app.pathForFile(file)).filter((item) => item.length > 0)
    if (paths.length) void uploadPaths(paths)
  }

  if (!settings) return <div className="page-loading">Loading…</div>
  if (!deviceId) {
    return (
      <div className="explorer-page">
        <div className="explorer-main">
          <div className="empty-state">
            <FolderOpen size={40} />
            <h3>No device open</h3>
            <p>Pick a connected device on the Devices page.</p>
            <button className="btn btn-primary" onClick={() => useAppStore.getState().setView('devices')}>
              Go to devices
            </button>
          </div>
        </div>
      </div>
    )
  }

  const visible = visibleEntries(entries, settings).filter((entry) =>
    filter ? entry.name.toLowerCase().includes(filter.toLowerCase()) : true
  )

  return (
    <div className="explorer-page">
      <Sidebar collapsed={collapsed} onCollapse={() => setCollapsed(true)} />
      <div className="explorer-main">
        {collapsed && (
          <button className="sidebar-expand" onClick={() => setCollapsed(false)} title="Show sidebar">
            <ChevronRight size={15} />
          </button>
        )}
        <div
          className="file-area"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelection([], null)
          }}
        >
          {loading ? (
            <div className="skeleton-list">
              {Array.from({ length: 10 }).map((_, index) => (
                <div className="skeleton-row" key={index}>
                  <span className="skeleton skeleton-icon" />
                  <span className="skeleton" style={{ width: `${30 + ((index * 7) % 40)}%` }} />
                  <span className="skeleton skeleton-meta" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="empty-state error-state">
              <AlertTriangle size={38} />
              <h3>Could not open this folder</h3>
              <p>{error}</p>
              <button className="btn" onClick={() => void refresh()}>
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty-state">
              <FolderOpen size={38} />
              <h3>{filter ? 'No matches' : 'This folder is empty'}</h3>
              <p>{filter ? `Nothing matches “${filter}”.` : 'Drop files here to upload them.'}</p>
              {filter ? (
                <button className="btn" onClick={() => useExplorerStore.getState().setFilter('')}>
                  Clear filter
                </button>
              ) : (
                <button className="btn" onClick={() => void newFolder()}>
                  <FolderPlus size={14} /> New folder
                </button>
              )}
            </div>
          ) : (settings.view ?? 'list') === 'grid' ? (
            <FileGrid
              entries={visible}
              selection={selection}
              anchor={anchor}
              onSelect={setSelection}
              onOpen={openEntry}
              onContext={(event, entry) => setMenu({ x: event.clientX, y: event.clientY, entry })}
            />
          ) : (
            <FileList
              entries={visible}
              selection={selection}
              anchor={anchor}
              settings={settings}
              onSelect={setSelection}
              onOpen={openEntry}
              onContext={(event, entry) => setMenu({ x: event.clientX, y: event.clientY, entry })}
              onSort={(field) => void setSort(field)}
            />
          )}

          {dragging && (
            <div className="drop-overlay">
              <UploadCloud size={40} />
              <strong>Drop to upload</strong>
              <span>{path}</span>
            </div>
          )}
        </div>
        <InfoBar />
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.entry)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
