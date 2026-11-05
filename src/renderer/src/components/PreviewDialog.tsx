import { useEffect, useState } from 'react'
import { AlertTriangle, Download, FileQuestion, Loader2, X } from 'lucide-react'
import { formatBytes } from '@shared/format'
import type { TextPreview } from '@shared/types'
import { useAppStore } from '../store/appStore'
import { useExplorerStore } from '../store/explorerStore'
import { api, errorMessage } from '../lib/api'
import { FileIcon, fileTypeLabel } from '../lib/fileIcon'
import { previewKind, previewUrl } from '@shared/preview'

const TEXT_PREVIEW_LIMIT = 512 * 1024

export function PreviewDialog(): React.JSX.Element | null {
  const preview = useAppStore((state) => state.preview)
  const close = useAppStore((state) => state.closePreview)
  const deviceId = useExplorerStore((state) => state.deviceId)

  const [text, setText] = useState<TextPreview | null>(null)
  const [textError, setTextError] = useState<string | null>(null)
  const [mediaError, setMediaError] = useState(false)

  const kind = preview ? previewKind(preview) : null

  useEffect(() => {
    setText(null)
    setTextError(null)
    setMediaError(false)
    if (!preview || !deviceId || kind !== 'text') return
    let cancelled = false
    api.fs
      .readText(deviceId, preview.path, TEXT_PREVIEW_LIMIT)
      .then((result) => {
        if (!cancelled) setText(result)
      })
      .catch((error) => {
        if (!cancelled) setTextError(errorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [preview, deviceId, kind])

  if (!preview) return null

  const download = async (): Promise<void> => {
    await useExplorerStore.getState().downloadEntry(preview)
    close()
  }

  const renderBody = (): React.JSX.Element => {
    if (!deviceId) {
      return (
        <div className="preview-message">
          <AlertTriangle size={30} />
          <strong>Device is not connected</strong>
          <span>Reconnect the device and try again.</span>
        </div>
      )
    }
    if (kind === 'image') {
      return mediaError ? (
        <Unsupported name={preview.name} />
      ) : (
        <div className="preview-media">
          <img src={previewUrl(deviceId, preview)} alt={preview.name} onError={() => setMediaError(true)} />
        </div>
      )
    }
    if (kind === 'video') {
      return mediaError ? (
        <Unsupported name={preview.name} note="This video codec is not supported by the in-app player." />
      ) : (
        <div className="preview-media">
          <video
            key={preview.path}
            src={previewUrl(deviceId, preview)}
            controls
            preload="metadata"
            onError={() => setMediaError(true)}
          />
        </div>
      )
    }
    if (kind === 'audio') {
      return mediaError ? (
        <Unsupported name={preview.name} note="This audio codec is not supported by the in-app player." />
      ) : (
        <div className="preview-message preview-audio">
          <FileIcon entry={preview} size={42} />
          <strong>{preview.name}</strong>
          <audio key={preview.path} src={previewUrl(deviceId, preview)} controls onError={() => setMediaError(true)} />
        </div>
      )
    }
    if (kind === 'binary') {
      return <Unsupported name={preview.name} />
    }
    if (textError) {
      return (
        <div className="preview-message error-state">
          <AlertTriangle size={30} />
          <strong>Could not read this file</strong>
          <span>{textError}</span>
        </div>
      )
    }
    if (!text) {
      return (
        <div className="preview-message">
          <Loader2 size={28} className="spin" />
          <span>Loading preview…</span>
        </div>
      )
    }
    if (text.binary) {
      return <Unsupported name={preview.name} />
    }
    return (
      <div className="preview-text-wrap">
        <pre className="preview-text">{text.text}</pre>
        {text.truncated && (
          <div className="preview-truncated">
            Showing the first {formatBytes(Math.min(TEXT_PREVIEW_LIMIT, text.size))} of {formatBytes(text.size)}.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="overlay preview-overlay" onMouseDown={() => close()}>
      <div
        className="preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${preview.name}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="preview-head">
          <span className="preview-file-icon">
            <FileIcon entry={preview} size={18} />
          </span>
          <div className="preview-title">
            <strong title={preview.name}>{preview.name}</strong>
            <span>
              {fileTypeLabel(preview)} · {formatBytes(preview.size)}
            </span>
          </div>
          <button className="icon-btn" onClick={() => close()} title="Close preview">
            <X size={17} />
          </button>
        </div>

        <div className="preview-body">{renderBody()}</div>

        <div className="preview-foot">
          <span className="preview-hint">Previewed directly from the device — nothing was downloaded.</span>
          <button className="btn" onClick={() => void download()}>
            <Download size={14} /> Download
          </button>
        </div>
      </div>
    </div>
  )
}

function Unsupported({ name, note }: { name: string; note?: string }): React.JSX.Element {
  return (
    <div className="preview-message">
      <FileQuestion size={34} />
      <strong>No preview for this file type</strong>
      <span>{note ?? `${name} is binary or uses a format RemoteDock cannot display.`}</span>
      <span className="preview-message-sub">Use Download to save it locally.</span>
    </div>
  )
}
