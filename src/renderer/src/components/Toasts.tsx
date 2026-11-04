import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'

export function Toasts(): React.JSX.Element {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          <span className="toast-icon">
            {toast.kind === 'success' ? (
              <CheckCircle2 size={16} />
            ) : toast.kind === 'error' ? (
              <AlertCircle size={16} />
            ) : (
              <Info size={16} />
            )}
          </span>
          <span className="toast-text">{toast.message}</span>
          <button className="toast-close" onClick={() => dismiss(toast.id)} title="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
