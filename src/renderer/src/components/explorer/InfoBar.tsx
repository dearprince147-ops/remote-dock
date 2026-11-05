import { formatBytes } from '@shared/format'
import { useAppStore } from '../../store/appStore'
import { useExplorerStore, visibleEntries } from '../../store/explorerStore'

export function InfoBar(): React.JSX.Element {
  const entries = useExplorerStore((state) => state.entries)
  const selection = useExplorerStore((state) => state.selection)
  const loading = useExplorerStore((state) => state.loading)
  const filter = useExplorerStore((state) => state.filter)
  const settings = useAppStore((state) => state.settings)
  const selected = entries.filter((entry) => selection.includes(entry.path))
  const selectedSize = selected.reduce((total, entry) => total + entry.size, 0)
  const visible = visibleEntries(entries, settings).filter((entry) =>
    filter ? entry.name.toLowerCase().includes(filter.toLowerCase()) : true
  )

  return (
    <div className="info-bar">
      <span>
        {loading ? 'Loading…' : `${visible.length} item${visible.length === 1 ? '' : 's'}`}
      </span>
      {selection.length > 0 && (
        <>
          <span className="info-sep" />
          <span>{selection.length} selected</span>
          <span className="info-sep" />
          <span>{formatBytes(selectedSize)}</span>
        </>
      )}
      <span className="info-spacer" />
      <span className="info-hint">Double-click to preview · Right-click for actions</span>
    </div>
  )
}
