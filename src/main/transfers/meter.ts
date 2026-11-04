import { Transform } from 'node:stream'

/** Shared token bucket. `ratePerSec <= 0` disables throttling. */
export class TokenBucket {
  private tokens = 0
  private last = Date.now()
  private rate: number

  constructor(ratePerSec: number) {
    this.rate = ratePerSec
    this.tokens = Math.max(0, ratePerSec)
  }

  setRate(ratePerSec: number): void {
    this.rate = Math.max(0, ratePerSec)
    this.tokens = Math.min(this.tokens, this.rate)
    this.last = Date.now()
  }

  take(bytes: number, signal?: AbortSignal): Promise<void> {
    if (this.rate <= 0 || bytes <= 0) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      let remaining = bytes
      let timer: NodeJS.Timeout | null = null
      const cleanup = (): void => {
        if (timer) clearTimeout(timer)
        timer = null
        signal?.removeEventListener('abort', onAbort)
      }
      const fail = (): void => {
        cleanup()
        reject(new Error('Transfer paused'))
      }
      const onAbort = (): void => fail()
      signal?.addEventListener('abort', onAbort, { once: true })
      const attempt = (): void => {
        timer = null
        if (signal?.aborted) {
          fail()
          return
        }
        const now = Date.now()
        this.tokens = Math.min(this.rate, this.tokens + ((now - this.last) / 1000) * this.rate)
        this.last = now
        if (this.tokens >= remaining) {
          this.tokens -= remaining
          cleanup()
          resolve()
          return
        }
        // A chunk can be larger than one second of the configured rate. Consume
        // what is available and wait for the rest instead of capping the bucket
        // below the chunk size, which would never resolve.
        remaining -= this.tokens
        this.tokens = 0
        const wait = Math.max(5, Math.ceil((remaining / this.rate) * 1000))
        timer = setTimeout(attempt, wait)
      }
      attempt()
    })
  }
}

export interface MeterSample {
  doneBytes: number
  speedBps: number
  etaSec: number | null
}

export interface MeterOptions {
  totalBytes: number
  offset: number
  throttle?: TokenBucket
  signal?: AbortSignal
  onSample: (sample: MeterSample) => void
}

/** Counts transferred bytes, smooths speed (EMA) every 500 ms and computes ETA. */
export class Meter extends Transform {
  private bytes: number
  private lastBytes: number
  private lastTime = Date.now()
  private speed = 0
  private timer: NodeJS.Timeout

  constructor(private readonly options: MeterOptions) {
    super()
    this.bytes = options.offset
    this.lastBytes = options.offset
    this.timer = setInterval(() => this.sample(), 500)
    this.timer.unref()
  }

  private sample(): void {
    const now = Date.now()
    const elapsed = (now - this.lastTime) / 1000
    if (elapsed <= 0) return
    const instant = (this.bytes - this.lastBytes) / elapsed
    this.speed = this.speed > 0 ? this.speed * 0.7 + instant * 0.3 : instant
    this.lastBytes = this.bytes
    this.lastTime = now
    const remaining = Math.max(0, this.options.totalBytes - this.bytes)
    const etaSec = this.speed >= 1024 ? remaining / this.speed : null
    this.options.onSample({ doneBytes: this.bytes, speedBps: this.speed, etaSec })
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const push = (): void => {
      this.bytes += chunk.length
      this.push(chunk)
      callback()
    }
    const throttle = this.options.throttle
    if (throttle) {
      throttle.take(chunk.length, this.options.signal).then(push, (error) => callback(error as Error))
    } else {
      push()
    }
  }

  override _flush(callback: (error?: Error | null) => void): void {
    this.sample()
    clearInterval(this.timer)
    callback()
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    clearInterval(this.timer)
    callback(error)
  }
}
