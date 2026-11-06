import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minus, Plus } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { formatBytes } from '@shared/format'
import type { FileEntry } from '@shared/types'
import { api, errorMessage } from '../../lib/api'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const PDF_MAX_BYTES = 64 * 1024 * 1024
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8
const MAX_CANVAS_PIXELS = 16_000_000
const PAGE_PADDING = 24

interface PdfPreviewProps {
  deviceId: string
  entry: FileEntry
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

export function PdfPreview({ deviceId, entry }: PdfPreviewProps): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    loadingTaskRef.current = null
    setPageCount(0)
    setPageNumber(1)
    setZoom(1)
    setLoading(true)
    setRendering(false)
    setError(null)

    void (async () => {
      const file = await api.fs.readBytes(deviceId, entry.path, PDF_MAX_BYTES)
      if (cancelled) return
      if (file.truncated) {
        throw new Error(`This PDF is larger than ${formatBytes(PDF_MAX_BYTES)} and is too big to preview.`)
      }
      if (!file.data?.length) throw new Error('This PDF is empty.')
      const task = pdfjsLib.getDocument({ data: file.data })
      loadingTaskRef.current = task
      const pdf = await task.promise
      if (cancelled) {
        void task.destroy()
        return
      }
      setDoc(pdf)
      setPageCount(pdf.numPages)
      setLoading(false)
    })().catch((reason) => {
      if (cancelled) return
      setError(errorMessage(reason))
      setLoading(false)
    })

    return () => {
      cancelled = true
      void loadingTaskRef.current?.destroy()
      loadingTaskRef.current = null
    }
  }, [deviceId, entry.path, entry.mtime])

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
    if (!doc) return
    let cancelled = false
    let task: RenderTask | null = null
    setRendering(true)

    void (async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const availableWidth = Math.max(1, viewportSize.width - PAGE_PADDING)
      const availableHeight = Math.max(1, viewportSize.height - PAGE_PADDING)
      const fit = Math.min(availableWidth / base.width, availableHeight / base.height)
      const viewport = page.getViewport({ scale: Math.max(0.05, fit * zoom) })
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) throw new Error('Could not create the PDF canvas.')

      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, viewport.width * viewport.height))
      )
      canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio))
      canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio))
      canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`
      canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

      task = page.render({ canvasContext: context, viewport, canvas })
      await task.promise
      if (!cancelled) {
        setRendering(false)
        setError(null)
      }
    })().catch((reason) => {
      if (cancelled) return
      if ((reason as { name?: string })?.name === 'RenderingCancelledException') return
      setRendering(false)
      setError(errorMessage(reason))
    })

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber, zoom, viewportSize.width, viewportSize.height])

  const goToPage = (next: number): void => {
    setPageNumber(Math.min(pageCount || 1, Math.max(1, next)))
    viewportRef.current?.scrollTo({ top: 0, left: 0 })
  }

  return (
    <div className="pdf-preview">
      <div className="pdf-toolbar">
        <div className="pdf-page-controls">
          <button className="icon-btn" onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1} title="Previous page">
            <ChevronLeft size={16} />
          </button>
          <span className="pdf-page-label">
            Page {pageNumber} of {pageCount || '—'}
          </span>
          <button
            className="icon-btn"
            onClick={() => goToPage(pageNumber + 1)}
            disabled={!pageCount || pageNumber >= pageCount}
            title="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="pdf-zoom-controls">
          <button
            className="icon-btn"
            onClick={() => setZoom((current) => clampZoom(current - 0.25))}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out"
          >
            <Minus size={15} />
          </button>
          <button className="zoom-level" onClick={() => setZoom(1)} title="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="icon-btn"
            onClick={() => setZoom((current) => clampZoom(current + 0.25))}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in"
          >
            <Plus size={15} />
          </button>
          <div className="zoom-sep" />
          <button className="icon-btn" onClick={() => setZoom(1)} title="Fit to screen">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      <div ref={viewportRef} className="pdf-viewport">
        <div className="pdf-stage">
          <canvas ref={canvasRef} />
        </div>
        {(loading || rendering) && !error && (
          <div className="pdf-loading">
            <Loader2 size={26} className="spin" />
            <span>{loading ? 'Loading PDF…' : 'Rendering page…'}</span>
          </div>
        )}
        {error && (
          <div className="pdf-error">
            <strong>Could not display this PDF</strong>
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}
