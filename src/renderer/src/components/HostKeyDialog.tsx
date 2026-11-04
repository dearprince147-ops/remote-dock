import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useAppStore } from '../store/appStore'

export function HostKeyDialog(): React.JSX.Element | null {
  const prompt = useAppStore((state) => state.hostPrompt)
  const answer = useAppStore((state) => state.answerHost)
  if (!prompt) return null

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="dialog-head">
          <div className="dialog-mark">
            {prompt.changed ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
          </div>
          <div>
            <h2 className="dialog-title">Verify the host key</h2>
            <p className="dialog-message">
              {prompt.changed
                ? 'This host key is different from the one saved earlier. Continue only if you trust this change.'
                : 'This is the first connection to this host. Compare the fingerprint if you can.'}
            </p>
          </div>
        </div>
        <div className="fingerprint-box">
          <div className="fingerprint-host">
            {prompt.host}:{prompt.port}
          </div>
          <code>{prompt.fingerprint}</code>
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={() => answer(false)}>
            Reject
          </button>
          <button className={`btn ${prompt.changed ? 'btn-danger' : 'btn-primary'}`} onClick={() => answer(true)} autoFocus>
            {prompt.changed ? 'Accept anyway' : 'Trust and connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
