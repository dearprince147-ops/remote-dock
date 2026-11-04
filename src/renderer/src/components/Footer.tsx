import { ArrowDownToLine, ArrowUpFromLine, ChevronUp, Loader2 } from 'lucide-react'
import { formatBytes, formatEta, formatSpeed, percent } from '@shared/format'
import { useAppStore } from '../store/appStore'
import { useExplorerStore, visibleEntries } from '../store/explorerStore'
import { useTransferStore } from '../store/transferStore'

export function Footer(): React.JSX.Element {
  const view = useAppStore((state) => state.view)
  const devices = useAppStore((state) => state.devices)
  const activeDeviceId = useAppStore((state) => state.activeDeviceId)
  const settings = useAppStore((state) => state.settings)

  const transfers = useTransferStore((state) => state.transfers)
  const aggregate = useTransferStore((state) => state.aggregate)
  const toggleDrawer = useTransferStore((state) => state.toggleDrawer)
  const drawerOpen = useTransferStore((state) => state.drawerOpen)

  const entries = useExplorerStore((state) => state.entries)
  const selection = useExplorerStore((state) => state.selection)
  const filter = useExplorerStore((state) => state.filter)

  const device = devices.find((item) => item.id === activeDeviceId)
  const unit = settings?.speedUnit ?? 'bytes'
  const selectedEntries = entries.filter((entry) => selection.includes(entry.path))
  const selectedSize = selectedEntries.reduce((total, entry) => total + entry.size, 0)
  const visible = visibleEntries(entries, settings).filter((entry) =>
    filter ? entry.name.toLowerCase().includes(filter.toLowerCase()) : true
  )
  const pending = aggregate.active + aggregate.queued + aggregate.paused + aggregate.failed
  const summary = pending > 0

  return (
    <footer className="app-footer">
      <div className="footer-left">
        {device ? (
          <>
            <span className={`dot ${device.status}`} />
            <span className="footer-device">{device.name}</span>
            <span className="footer-muted">
              {device.status === 'connected'
                ? 'connected'
                : device.status === 'unauthorized'
                  ? 'authorization needed'
                  : device.statusDetail ?? device.status}
            </span>
          </>
        ) : (
          <span className="footer-muted">No device connected</span>
        )}
      </div>

      <button className={`footer-center ${summary ? 'active' : ''}`} onClick={toggleDrawer} title="Open transfers">
        {summary ? (
          <>
            <span className="footer-speed down">
              <ArrowDownToLine size={13} />
              {formatSpeed(aggregate.downBps, unit)}
            </span>
            <span className="footer-speed up">
              <ArrowUpFromLine size={13} />
              {formatSpeed(aggregate.upBps, unit)}
            </span>
            <span className="footer-counts">
              {aggregate.active} active · {aggregate.queued} queued
              {aggregate.paused > 0 ? ` · ${aggregate.paused} paused` : ''}
              {aggregate.failed > 0 ? ` · ${aggregate.failed} failed` : ''}
            </span>
            <span className="footer-eta">
              <Loader2 size={12} className="spin" /> ETA {formatEta(aggregate.etaSec)}
            </span>
            <span className="footer-progress">
              <span style={{ width: `${percent(aggregate.overallPct, 100)}%` }} />
            </span>
          </>
        ) : (
          <span className="footer-idle">
            Idle
            {transfers.length > 0 ? ` · ${transfers.length} transfer${transfers.length === 1 ? '' : 's'}` : ''}
          </span>
        )}
      </button>

      <div className="footer-right">
        {view === 'explorer' && (
          <span className="footer-selection">
            {selection.length > 0
              ? `${selection.length} selected · ${formatBytes(selectedSize)}`
              : `${visible.length} items`}
          </span>
        )}
        <button className={`icon-btn footer-drawer ${drawerOpen ? 'on' : ''}`} onClick={toggleDrawer} title="Transfers">
          <ChevronUp size={16} className={drawerOpen ? 'flip' : ''} />
          {transfers.length > 0 && <span className="badge">{transfers.length}</span>}
        </button>
      </div>
    </footer>
  )
}
