import { useEffect, useRef, useState } from 'react'
import { CornerDownLeft, HardDrive } from 'lucide-react'
import { explorerPaths } from '../store/explorerStore'

interface BreadcrumbsProps {
  path: string
  onNavigate: (path: string) => void
}

export function Breadcrumbs({ path, onNavigate }: BreadcrumbsProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(path)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(path)
    setEditing(false)
  }, [path])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const parts = path.split('/').filter(Boolean)
  const segments = parts.map((part, index) => ({
    label: part,
    path: `/${parts.slice(0, index + 1).join('/')}`
  }))

  const commit = (): void => {
    const next = explorerPaths.norm(value.trim() || '/')
    setEditing(false)
    if (next !== path) onNavigate(next)
  }

  if (editing) {
    return (
      <div className="crumbs crumbs-editing">
        <input
          ref={inputRef}
          className="path-input"
          value={value}
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') {
              setValue(path)
              setEditing(false)
            }
          }}
        />
        <span className="path-hint">
          <CornerDownLeft size={13} /> Enter
        </span>
      </div>
    )
  }

  return (
    <div className="crumbs" onDoubleClick={() => setEditing(true)}>
      <button
        className="crumb crumb-root"
        onClick={() => onNavigate('/')}
        onDoubleClick={(event) => event.stopPropagation()}
        title="Root"
      >
        <HardDrive size={14} />
      </button>
      {segments.map((segment) => (
        <span className="crumb-group" key={segment.path}>
          <span className="crumb-sep">/</span>
          <button className="crumb" onClick={() => onNavigate(segment.path)} onDoubleClick={(event) => event.stopPropagation()}>
            {segment.label}
          </button>
        </span>
      ))}
      <button className="crumb-fill" onClick={() => setEditing(true)} title="Click to type a path" aria-label="Edit path" />
    </div>
  )
}
