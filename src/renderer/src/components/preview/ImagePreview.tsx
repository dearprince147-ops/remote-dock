import { useEffect, useRef, useState } from 'react'
import { Loader2, Maximize2, Minus, Plus } from 'lucide-react'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
const STAGE_PADDING = 28

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

interface ImagePreviewProps {
  src: string
  alt: string
  onError: () => void
}

interface Size {
  width: number
  height: number
}

export function ImagePreview({ src, alt, onError }: ImagePreviewProps): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 })
  const [natural, setNatural] = useState<Size | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const measure = (): void => {
      setViewportSize({ width: element.clientWidth, height: element.clientHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setZoom((current) => clampZoom(current * (event.deltaY < 0 ? 1.12 : 1 / 1.12)))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const fitScale =
    natural && viewportSize.width > 0 && viewportSize.height > 0
      ? Math.min(
          Math.max(1, viewportSize.width - STAGE_PADDING) / natural.width,
          Math.max(1, viewportSize.height - STAGE_PADDING) / natural.height,
          1
        )
      : 0
  const width = natural ? Math.max(1, Math.round(natural.width * fitScale * zoom)) : 1
  const height = natural ? Math.max(1, Math.round(natural.height * fitScale * zoom)) : 1
  const canPan = zoom > 1.001

  const applyZoom = (next: number): void => {
    setZoom(clampZoom(next))
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const element = viewportRef.current
    if (!canPan || !element || event.button !== 0) return
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: element.scrollLeft,
      top: element.scrollTop
    }
    setDragging(true)
    element.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const element = viewportRef.current
    const drag = dragRef.current
    if (!element || !drag) return
    element.scrollLeft = drag.left - (event.clientX - drag.x)
    element.scrollTop = drag.top - (event.clientY - drag.y)
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    dragRef.current = null
    setDragging(false)
    const element = viewportRef.current
    if (element?.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  }

  return (
    <div className="image-preview">
      <div
        ref={viewportRef}
        className={`image-viewport ${canPan ? 'can-pan' : ''} ${dragging ? 'dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => applyZoom(zoom > 1.001 ? 1 : 2)}
      >
        <div className="image-stage">
          <img
            src={src}
            alt={alt}
            draggable={false}
            style={{ width: `${width}px`, height: `${height}px`, opacity: loaded ? 1 : 0 }}
            onLoad={(event) => {
              const image = event.currentTarget
              if (!image.naturalWidth || !image.naturalHeight) {
                onError()
                return
              }
              setNatural({ width: image.naturalWidth, height: image.naturalHeight })
              setLoaded(true)
            }}
            onError={onError}
          />
        </div>
        {!loaded && (
          <div className="image-loading">
            <Loader2 size={28} className="spin" />
            <span>Loading image…</span>
          </div>
        )}
      </div>

      <div className="image-controls" onPointerDown={(event) => event.stopPropagation()}>
        <button
          className="icon-btn"
          onClick={() => applyZoom(zoom - 0.25)}
          disabled={zoom <= MIN_ZOOM}
          title="Zoom out (Ctrl+scroll)"
        >
          <Minus size={15} />
        </button>
        <button className="zoom-level" onClick={() => applyZoom(1)} title="Reset zoom">
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="icon-btn"
          onClick={() => applyZoom(zoom + 0.25)}
          disabled={zoom >= MAX_ZOOM}
          title="Zoom in (Ctrl+scroll)"
        >
          <Plus size={15} />
        </button>
        <div className="zoom-sep" />
        <button className="icon-btn" onClick={() => applyZoom(1)} title="Fit to screen">
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  )
}
