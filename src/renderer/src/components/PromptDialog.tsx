import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'

export function PromptDialog(): React.JSX.Element | null {
  const prompt = useAppStore((state) => state.prompt)
  const resolve = useAppStore((state) => state.resolvePrompt)
  const [value, setValue] = useState('')

  useEffect(() => {
    setValue(prompt?.value ?? '')
  }, [prompt])

  useEffect(() => {
    if (!prompt) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        resolve(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [prompt, resolve])

  if (!prompt) return null

  const submit = (): void => {
    if (!value.trim()) return
    resolve(value)
  }

  return (
    <div className="overlay" onMouseDown={() => resolve(null)}>
      <form
        className="dialog dialog-sm"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">{prompt.title}</h2>
            {prompt.label && <p className="dialog-message">{prompt.label}</p>}
          </div>
        </div>
        <input
          className="input"
          value={value}
          placeholder={prompt.placeholder}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
          spellCheck={false}
        />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => resolve(null)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            {prompt.confirmLabel ?? 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
