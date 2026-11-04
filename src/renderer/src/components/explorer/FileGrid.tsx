import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatBytes } from '@shared/format'
import type { FileEntry } from '@shared/types'
import { FileIcon } from '../../lib/fileIcon'

interface FileGridProps {
  entries: FileEntry[]
  selection: string[]
  anchor: string | null
  onSelect: (paths: string[], anchor: string | null) => void
  onOpen: (entry: FileEntry) => void
  onContext: (event: React.MouseEvent, entry: FileEntry) => void
}

const TILE_MIN = 128
const ROW_HEIGHT = 118

export function FileGrid({ entries, selection, anchor, onSelect, onOpen, onContext }: FileGridProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  const columns = Math.max(2, Math.floor((width - 20) / TILE_MIN))
  const rows = Math.ceil(entries.length / columns)
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5
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

  return (
    <div ref={scrollRef} className="grid-scroll" onClick={(event) => { if (event.target === event.currentTarget) onSelect([], null) }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const start = row.index * columns
          const rowEntries = entries.slice(start, start + columns)
          return (
            <div
              key={row.key}
              className="grid-row"
              style={{
                transform: `translateY(${row.start}px)`,
                height: `${row.size}px`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
              }}
            >
              {rowEntries.map((entry, offset) => {
                const index = start + offset
                const isSelected = selection.includes(entry.path)
                return (
                  <button
                    key={entry.path}
                    className={`grid-tile ${isSelected ? 'selected' : ''}`}
                    onClick={(event) => selectAt(index, event)}
                    onDoubleClick={() => onOpen(entry)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      if (!selection.includes(entry.path)) onSelect([entry.path], entry.path)
                      onContext(event, entry)
                    }}
                    title={entry.name}
                  >
                    <span className={`grid-icon ${entry.isDir ? 'folder' : ''}`}>
                      <FileIcon entry={entry} size={34} />
                    </span>
                    <span className="grid-name">{entry.name}</span>
                    <span className="grid-meta">{entry.isDir ? 'Folder' : formatBytes(entry.size)}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
