import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, FolderOpen, Pause, Play, RotateCcw, Trash2, X } from 'lucide-react'
import { formatBytes, formatEta, formatSpeed, percent } from '@shared/format'
import type { Transfer, TransferStatus } from '@shared/types'
import { useAppStore } from '../store/appStore'
import { useTransferStore } from '../store/transferStore'

const STATUS_LABEL: Record<TransferStatus, string> = {
  queued: 'Queued',
  running: 'Transferring',
  paused: 'Paused',
  'waiting-connection': 'Waiting for device',
  verifying: 'Verifying',
  done: 'Done',
  error: 'Failed',
  canceled: 'Canceled'
}

export function TransfersDrawer(): React.JSX.Element {
  const open = useTransferStore((state) => state.drawerOpen)
  const setOpen = useTransferStore((state) => state.setDrawerOpen)
  const transfers = useTransferStore((state) => state.transfers)
  const aggregate = useTransferStore((state) => state.aggregate)
  const pause = useTransferStore((state) => state.pause)
  const resume = useTransferStore((state) => state.resume)
  const retry = useTransferStore((state) => state.retry)
  const cancel = useTransferStore((state) => state.cancel)
  const clearFinished = useTransferStore((state) => state.clearFinished)
  const showInFolder = useTransferStore((state) => state.showInFolder)
  const settings = useAppStore((state) => state.settings)

  if (!open) return <div className="drawer-closed" />

  const unit = settings?.speedUnit ?? 'bytes'
  const hasPausable = transfers.some((job) => ['running', 'queued', 'verifying'].includes(job.status))
  const hasPaused = transfers.some((job) => ['paused', 'waiting-connection'].includes(job.status))
  const hasFinished = transfers.some((job) => job.status === 'done' || job.status === 'canceled')

  return (
    <section className="drawer" aria-label="Transfers">
      <div className="drawer-head">
        <div className="drawer-title">
          <h2>Transfers</h2>
          <span className="drawer-sub">
            {aggregate.active} active · {aggregate.queued} queued · {aggregate.paused} paused
            {aggregate.failed > 0 ? ` · ${aggregate.failed} failed` : ''}
          </span>
        </div>
        <div className="drawer-actions">
          <button className="btn btn-sm" onClick={() => void pause('all')} disabled={!hasPausable}>
            <Pause size={13} /> Pause all
          </button>
          <button className="btn btn-sm" onClick={() => void resume('all')} disabled={!hasPaused}>
            <Play size={13} /> Resume all
          </button>
          <button className="btn btn-sm" onClick={() => void clearFinished()} disabled={!hasFinished}>
            Clear finished
          </button>
          <button className="icon-btn" onClick={() => setOpen(false)} title="Close transfers">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="drawer-body">
        {transfers.length === 0 ? (
          <div className="drawer-empty">
            <FolderOpen size={26} />
            <p>No transfers yet</p>
            <span>Downloads and uploads will appear here.</span>
          </div>
        ) : (
          transfers.map((job) => <TransferRow key={job.id} job={job} unit={unit} />)
        )}
      </div>
    </section>
  )
}

function TransferRow({ job, unit }: { job: Transfer; unit: 'bytes' | 'bits' }): React.JSX.Element {
  const pause = useTransferStore((state) => state.pause)
  const resume = useTransferStore((state) => state.resume)
  const retry = useTransferStore((state) => state.retry)
  const cancel = useTransferStore((state) => state.cancel)
  const showInFolder = useTransferStore((state) => state.showInFolder)
  const pct = percent(job.doneBytes, job.totalBytes)
  const canPause = ['running', 'queued', 'verifying'].includes(job.status)
  const canResume = job.status === 'paused' || job.status === 'waiting-connection'
  const canCancel = ['running', 'queued', 'paused', 'waiting-connection', 'verifying'].includes(job.status)
  const canRetry = job.status === 'error'

  return (
    <div className={`transfer-row status-${job.status}`}>
      <span className={`transfer-dir ${job.direction}`}>
        {job.direction === 'download' ? <ArrowDownToLine size={16} /> : <ArrowUpFromLine size={16} />}
      </span>
      <div className="transfer-main">
        <div className="transfer-top">
          <span className="transfer-name" title={`${job.localPath} → ${job.remotePath}`}>
            {job.name}
          </span>
          <span className={`status-chip ${job.status}`}>{STATUS_LABEL[job.status]}</span>
          <span className="transfer-device">{job.deviceName}</span>
        </div>
        <div className="transfer-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="transfer-meta">
          <span>
            {formatBytes(job.doneBytes)} / {formatBytes(job.totalBytes)}
          </span>
          {job.status === 'running' && <span>{formatSpeed(job.speedBps, unit)}</span>}
          {job.status === 'running' && <span>ETA {formatEta(job.etaSec)}</span>}
          {job.status === 'done' && job.direction === 'download' && <span className="transfer-path">{job.localPath}</span>}
          {job.error && <span className="transfer-error">{job.error}</span>}
        </div>
      </div>
      <div className="transfer-actions">
        {canPause && (
          <button className="icon-btn" onClick={() => void pause(job.id)} title="Pause">
            <Pause size={14} />
          </button>
        )}
        {canResume && (
          <button className="icon-btn" onClick={() => void resume(job.id)} title="Resume">
            <Play size={14} />
          </button>
        )}
        {canRetry && (
          <button className="icon-btn" onClick={() => void retry(job.id)} title="Retry">
            <RotateCcw size={14} />
          </button>
        )}
        {job.status === 'done' && job.direction === 'download' && (
          <button className="icon-btn" onClick={() => void showInFolder(job.localPath)} title="Show in folder">
            <ExternalLink size={14} />
          </button>
        )}
        {canCancel && (
          <button className="icon-btn danger-hover" onClick={() => void cancel(job.id)} title="Cancel">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
