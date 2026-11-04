import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAppStore } from '../store/appStore'

export function ConfirmDialog(): React.JSX.Element | null {
  const dialog = useAppStore((state) => state.dialog)
  const checked = useAppStore((state) => state.dialogChecked)
  const setChecked = useAppStore((state) => state.setDialogChecked)
  const resolve = useAppStore((state) => state.resolveDialog)

  useEffect(() => {
    if (!dialog) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        resolve(false)
      }
      if (event.key === 'Enter' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        resolve(true)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dialog, resolve])

  if (!dialog) return null

  return (
    <div className="overlay" onMouseDown={() => resolve(false)}>
      <div className="dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <div className={`dialog-mark ${dialog.danger ? 'danger' : ''}`}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <h2 className="dialog-title">{dialog.title}</h2>
            {dialog.message && <p className="dialog-message">{dialog.message}</p>}
          </div>
        </div>

        {dialog.details && dialog.details.length > 0 && (
          <ul className="dialog-details">
            {dialog.details.map((detail, index) => (
              <li key={`${detail}-${index}`}>{detail}</li>
            ))}
          </ul>
        )}

        {dialog.checkboxLabel && (
          <label className="checkbox-row">
            <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            <span>{dialog.checkboxLabel}</span>
          </label>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={() => resolve(false)}>
            {dialog.cancelLabel ?? 'Cancel'}
          </button>
          <button className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => resolve(true)} autoFocus>
            {dialog.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
