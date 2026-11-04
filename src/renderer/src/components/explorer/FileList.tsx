import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatBytes, formatDate } from '@shared/format'
import type { FileEntry, Settings } from '@shared/types'
import { FileIcon, fileTypeLabel } from '../../lib/fileIcon'

interface FileListProps {
  entries: FileEntry[]
  selection: string[]
  anchor: string | null
  settings: Settings
  onSelect: (paths: string[], anchor: string | null) => void
  onOpen: (entry: FileEntry) => void
  onContext: (event: React.MouseEvent, entry: FileEntry) => void
  onSort: (field: 'name' | 'size' | 'mtime') => void
}

export function FileList({
  entries,
  selection,
  anchor,
  settings,
  onSelect,
  onOpen,
  onContext,
  onSort
}: FileListProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 14
  })

  const selectAt = (index: number, event: React.MouseEvent): void => {
    const entry = entries[index]
    if (!entry) return
    if (event.shiftKey && anchor) {
      const anchorIndex = entries.findIndex((item) => item.path === anchor)
      if (anchorIndex >= 0) {
        const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex]
        onSelect(entries.slice(from, to + 1).map((item) => item.path), anchor)
        return
      }
    }
    if (event.ctrlKey || event.metaKey) {
      const next = selection.includes(entry.path)
        ? selection.filter((item) => item !== entry.path)
        : [...selection, entry.path]
      onSelect(next, entry.path)
      return
    }
    onSelect([entry.path], entry.path)
  }

  const sortIndicator = (field: 'name' | 'size' | 'mtime'): React.JSX.Element | null => {
    if (settings.sortBy !== field) return null
    return settings.sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  return (
    <div className="file-table">
      <div className="file-head">
        <button className="file-col col-name" onClick={() => onSort('name')}>
          Name {sortIndicator('name')}
        </button>
        <button className="file-col col-size" onClick={() => onSort('size')}>
          Size {sortIndicator('size')}
        </button>
        <button className="file-col col-date" onClick={() => onSort('mtime')}>
          Modified {sortIndicator('mtime')}
        </button>
        <span className="file-col col-type">Type</span>
      </div>
      <div
        ref={scrollRef}
        className="file-scroll"
        onClick={(event) => {
          if (event.target === event.currentTarget) onSelect([], null)
        }}
      >
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((row) => {
            const entry = entries[row.index]
            if (!entry) return null
            const isSelected = selection.includes(entry.path)
            return (
              <div
                key={entry.path}
                className={`file-row ${isSelected ? 'selected' : ''}`}
                style={{ transform: `translateY(${row.start}px)`, height: `${row.size}px` }}
                onClick={(event) => selectAt(row.index, event)}
                onDoubleClick={() => onOpen(entry)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  if (!selection.includes(entry.path)) onSelect([entry.path], entry.path)
                  onContext(event, entry)
                }}
                draggable={false}
              >
                <span className="file-col col-name">
                  <FileIcon entry={entry} size={16} />
                  <span className="file-name" title={entry.name}>
                    {entry.name}
                  </span>
                  {entry.isSymlink && <span className="file-tag">link</span>}
                </span>
                <span className="file-col col-size">{entry.isDir ? '—' : formatBytes(entry.size)}</span>
                <span className="file-col col-date">{formatDate(entry.mtime)}</span>
                <span className="file-col col-type">{fileTypeLabel(entry)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
