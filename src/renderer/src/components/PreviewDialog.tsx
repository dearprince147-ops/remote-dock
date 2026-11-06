import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, FileQuestion, Loader2, Pencil, Save, X } from 'lucide-react'
import { formatBytes } from '@shared/format'
import type { TextPreview } from '@shared/types'
import { useAppStore } from '../store/appStore'
import { useExplorerStore } from '../store/explorerStore'
import { api, errorMessage } from '../lib/api'
import { FileIcon, fileTypeLabel } from '../lib/fileIcon'
import { previewKind, previewUrl } from '@shared/preview'
import { normalizeTextForSave } from '@shared/textEdit'
import { ImagePreview } from './preview/ImagePreview'
import { PdfPreview } from './preview/PdfPreview'

const TEXT_PREVIEW_LIMIT = 512 * 1024
const TEXT_EDIT_LIMIT = 4 * 1024 * 1024

export function PreviewDialog(): React.JSX.Element | null {
  const preview = useAppStore((state) => state.preview)
  const close = useAppStore((state) => state.closePreview)
  const toast = useAppStore((state) => state.pushToast)
  const deviceId = useExplorerStore((state) => state.deviceId)

  const [text, setText] = useState<TextPreview | null>(null)
  const [textError, setTextError] = useState<string | null>(null)
  const [mediaError, setMediaError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [savedDraft, setSavedDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [savedSize, setSavedSize] = useState<number | null>(null)
  const [mtime, setMtime] = useState(0)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const kind = preview ? previewKind(preview) : null

  useEffect(() => {
    setText(null)
    setTextError(null)
    setMediaError(false)
    setEditing(false)
    setDraft('')
    setSavedDraft('')
    setSaving(false)
    setEditLoading(false)
    setSavedSize(null)
    setMtime(preview?.mtime ?? 0)
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

  const cancelEdit = useCallback(async (): Promise<void> => {
    if (saving) return
    if (draft !== savedDraft) {
      const result = await useAppStore.getState().confirm({
        title: 'Discard changes?',
        message: 'Your edits to this file will be lost.',
        confirmLabel: 'Discard',
        danger: true
      })
      if (!result.ok) return
    }
    setDraft(savedDraft)
    setEditing(false)
  }, [draft, savedDraft, saving])

  const save = useCallback(async (): Promise<void> => {
    if (!preview || !deviceId || !text || saving || draft === savedDraft) return
    setSaving(true)
    try {
      const content = normalizeTextForSave(draft, text.newline, text.bom)
      const result = await api.fs.writeText(deviceId, preview.path, content, mtime)
      setText({ ...text, text: draft, size: result.size, truncated: false })
      setSavedDraft(draft)
      setSavedSize(result.size)
      setMtime(result.mtime)
      setEditing(false)
      toast('success', `Saved ${preview.name}`)
      void useExplorerStore.getState().refresh()
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [preview, deviceId, text, saving, draft, savedDraft, mtime, toast])

  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent): void => {
      const app = useAppStore.getState()
      if (app.dialog || app.prompt || app.hostPrompt) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        void cancelEdit()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        event.stopPropagation()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editing, cancelEdit, save])

  if (!preview) return null

  const isDirty = editing && draft !== savedDraft
  const tooLargeToEdit = Boolean(kind === 'text' && text && !text.binary && preview.size > TEXT_EDIT_LIMIT)
  const canEdit = Boolean(
    kind === 'text' && text && !text.binary && !textError && preview.size <= TEXT_EDIT_LIMIT
  )

  const startEdit = async (): Promise<void> => {
    if (!deviceId || !text || kind !== 'text') return
    setEditLoading(true)
    try {
      let full = text
      if (text.truncated) {
        full = await api.fs.readText(deviceId, preview.path, TEXT_EDIT_LIMIT)
      }
      if (full.binary) {
        toast('error', 'This file looks binary and cannot be edited as text.')
        return
      }
      if (full.truncated) {
        toast('error', `Files larger than ${formatBytes(TEXT_EDIT_LIMIT)} cannot be edited here.`)
        return
      }
      setText(full)
      setDraft(full.text)
      setSavedDraft(full.text)
      setMtime(preview.mtime)
      setEditing(true)
      setTimeout(() => editorRef.current?.focus(), 0)
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      setEditLoading(false)
    }
  }

  const requestClose = async (): Promise<void> => {
    if (saving) return
    if (editing && draft !== savedDraft) {
      const result = await useAppStore.getState().confirm({
        title: 'Discard changes?',
        message: 'Your edits to this file will be lost.',
        confirmLabel: 'Discard',
        danger: true
      })
      if (!result.ok) return
    }
    close()
  }

  const download = async (): Promise<void> => {
    if (editing && draft !== savedDraft) {
      const result = await useAppStore.getState().confirm({
        title: 'Discard changes?',
        message: 'Your edits to this file will be lost.',
        confirmLabel: 'Discard',
        danger: true
      })
      if (!result.ok) return
    }
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
        <ImagePreview
          key={`${preview.path}:${preview.mtime}`}
          src={previewUrl(deviceId, preview)}
          alt={preview.name}
          onError={() => setMediaError(true)}
        />
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
    if (kind === 'pdf') {
      return <PdfPreview key={`${preview.path}:${preview.mtime}`} deviceId={deviceId} entry={preview} />
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
    if (editing) {
      return (
        <div className="preview-text-wrap">
          <textarea
            ref={editorRef}
            className="preview-text-editor"
            value={draft}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return
              event.preventDefault()
              const element = event.currentTarget
              const start = element.selectionStart
              const end = element.selectionEnd
              setDraft(draft.slice(0, start) + '\t' + draft.slice(end))
              requestAnimationFrame(() => {
                element.selectionStart = element.selectionEnd = start + 1
              })
            }}
          />
          {text.truncated && (
            <div className="preview-truncated">
              The editor only loaded part of this file. Saving is disabled until it can be loaded in full.
            </div>
          )}
        </div>
      )
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

  const hint = editing
    ? 'Editing directly on the device. Ctrl+S to save, Esc to cancel.'
    : tooLargeToEdit
      ? `Too large to edit here (maximum ${formatBytes(TEXT_EDIT_LIMIT)}).`
      : 'Previewed directly from the device — nothing was downloaded.'

  return (
    <div className="overlay preview-overlay" onMouseDown={() => void requestClose()}>
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
              {fileTypeLabel(preview)} · {formatBytes(savedSize ?? preview.size)}
              {editing && isDirty ? ' · unsaved changes' : ''}
            </span>
          </div>
          <button className="icon-btn" onClick={() => void requestClose()} title="Close preview">
            <X size={17} />
          </button>
        </div>

        <div className="preview-body">{renderBody()}</div>

        <div className="preview-foot">
          <span className="preview-hint">{hint}</span>
          {editing ? (
            <div className="preview-actions">
              <button className="btn" onClick={() => void cancelEdit()} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => void save()} disabled={!isDirty || saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                Save
              </button>
            </div>
          ) : (
            <div className="preview-actions">
              {canEdit && (
                <button className="btn" onClick={() => void startEdit()} disabled={editLoading}>
                  {editLoading ? <Loader2 size={14} className="spin" /> : <Pencil size={14} />}
                  Edit
                </button>
              )}
              <button className="btn" onClick={() => void download()}>
                <Download size={14} /> Download
              </button>
            </div>
          )}
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
