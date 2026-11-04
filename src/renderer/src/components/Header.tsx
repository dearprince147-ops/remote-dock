import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  List,
  Minus,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  Smartphone,
  Terminal,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useExplorerStore } from '../store/explorerStore'
import { Breadcrumbs } from './Breadcrumbs'

export function Header(): React.JSX.Element {
  const view = useAppStore((state) => state.view)
  const devices = useAppStore((state) => state.devices)
  const activeDeviceId = useAppStore((state) => state.activeDeviceId)
  const fullscreen = useAppStore((state) => state.fullscreen)
  const settings = useAppStore((state) => state.settings)
  const setView = useAppStore((state) => state.setView)

  const path = useExplorerStore((state) => state.path)
  const selection = useExplorerStore((state) => state.selection)
  const filter = useExplorerStore((state) => state.filter)
  const history = useExplorerStore((state) => state.history)
  const historyIndex = useExplorerStore((state) => state.historyIndex)
  const setFilter = useExplorerStore((state) => state.setFilter)
  const navigate = useExplorerStore((state) => state.navigate)
  const back = useExplorerStore((state) => state.back)
  const forward = useExplorerStore((state) => state.forward)
  const up = useExplorerStore((state) => state.up)
  const refresh = useExplorerStore((state) => state.refresh)
  const toggleHidden = useExplorerStore((state) => state.toggleHidden)
  const uploadFiles = useExplorerStore((state) => state.uploadFiles)
  const uploadFolders = useExplorerStore((state) => state.uploadFolders)
  const downloadSelected = useExplorerStore((state) => state.downloadSelected)
  const newFolder = useExplorerStore((state) => state.newFolder)
  const renameSelected = useExplorerStore((state) => state.renameSelected)
  const deleteSelected = useExplorerStore((state) => state.deleteSelected)

  const device = devices.find((item) => item.id === activeDeviceId)
  const showHidden = settings?.showHidden ?? false
  const isList = (settings?.view ?? 'list') === 'list'

  const setViewMode = (mode: 'list' | 'grid'): void => {
    void useAppStore.getState().updateSettings({ view: mode })
  }

  return (
    <header className="app-header">
      <div className="header-left">
        {view === 'explorer' ? (
          <>
            <button className="icon-btn" onClick={() => setView('devices')} title="Back to devices">
              <ArrowLeft size={17} />
            </button>
            <button className="device-chip" onClick={() => setView('devices')} title={device?.subtitle ?? 'Devices'}>
              <span className={`kind-icon ${device?.kind ?? 'ssh'}`}>
                {device?.kind === 'adb' ? <Smartphone size={15} /> : <Terminal size={15} />}
              </span>
              <span className="device-chip-name">{device?.name ?? 'Device'}</span>
              <span className={`dot ${device?.status ?? 'disconnected'}`} />
            </button>
          </>
        ) : (
          <button className="brand" onClick={() => setView('devices')} title="RemoteDock home">
            <span className="brand-mark">
              <Download size={16} />
            </span>
            <span className="brand-name">
              Remote<span>Dock</span>
            </span>
          </button>
        )}
      </div>

      {view === 'explorer' && (
        <div className="header-center">
          <div className="nav-group">
            <button className="icon-btn" onClick={() => void back()} disabled={historyIndex <= 0} title="Back (Alt+Left)">
              <ArrowLeft size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={() => void forward()}
              disabled={historyIndex >= history.length - 1}
              title="Forward (Alt+Right)"
            >
              <ArrowRight size={16} />
            </button>
            <button className="icon-btn" onClick={() => void up()} disabled={path === '/'} title="Up (Backspace)">
              <ArrowUp size={16} />
            </button>
          </div>
          <Breadcrumbs path={path} onNavigate={(target) => void navigate(target)} />
        </div>
      )}

      <div className="header-right">
        {view === 'explorer' && (
          <>
            <div className="filter-box">
              <Search size={14} />
              <input
                data-filter-input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter"
                spellCheck={false}
                title="Filter this folder (Ctrl+F)"
              />
              {filter && (
                <button className="filter-clear" onClick={() => setFilter('')} title="Clear filter">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="header-sep" />
            <button className="icon-btn" onClick={() => void uploadFiles()} title="Upload files (Ctrl+U)">
              <Upload size={16} />
            </button>
            <button className="icon-btn" onClick={() => void uploadFolders()} title="Upload folder">
              <FolderUp size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={() => void downloadSelected()}
              disabled={!selection.length}
              title="Download (Ctrl+D)"
            >
              <Download size={16} />
            </button>
            <button className="icon-btn" onClick={() => void newFolder()} title="New folder (Ctrl+Shift+N)">
              <FolderPlus size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={() => void renameSelected()}
              disabled={selection.length !== 1}
              title="Rename (F2)"
            >
              <Pencil size={16} />
            </button>
            <button
              className="icon-btn danger-hover"
              onClick={() => void deleteSelected()}
              disabled={!selection.length}
              title="Delete (Del)"
            >
              <Trash2 size={16} />
            </button>
            <button className="icon-btn" onClick={() => void refresh()} title="Refresh (F5)">
              <RefreshCw size={16} />
            </button>
            <div className="header-sep" />
            <button className="icon-btn" onClick={() => void toggleHidden()} title={showHidden ? 'Hide hidden files (Ctrl+H)' : 'Show hidden files (Ctrl+H)'}>
              {showHidden ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              className="icon-btn"
              onClick={() => setViewMode(isList ? 'grid' : 'list')}
              title={isList ? 'Grid view' : 'List view'}
            >
              {isList ? <LayoutGrid size={16} /> : <List size={16} />}
            </button>
          </>
        )}

        {view !== 'settings' && (
          <button className="icon-btn" onClick={() => setView('settings')} title="Settings (Ctrl+,)">
            <Settings size={17} />
          </button>
        )}

        {fullscreen && (
          <div className="window-controls">
            <button className="window-btn" onClick={() => void window.api.window.minimize()} title="Minimize">
              <Minus size={15} />
            </button>
            <button className="window-btn" onClick={() => void window.api.window.toggleFullscreen()} title="Exit fullscreen (F11)">
              <ArrowRight size={14} className="exit-fullscreen-icon" />
            </button>
            <button className="window-btn close" onClick={() => void window.api.window.close()} title="Close">
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
