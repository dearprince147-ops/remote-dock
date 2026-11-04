import { afterEach, describe, expect, it, vi } from 'vitest'
import { TokenBucket } from '../src/main/transfers/meter'

describe('TokenBucket', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('handles a chunk larger than one second of bandwidth', async () => {
    vi.useFakeTimers()
    const bucket = new TokenBucket(1000)
    let settled = false
    const transfer = bucket.take(2500).then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(2000)
    await transfer
    expect(settled).toBe(true)
  })

  it('rejects a waiting transfer when its signal is aborted', async () => {
    vi.useFakeTimers()
    const bucket = new TokenBucket(100)
    const controller = new AbortController()
    const transfer = bucket.take(500, controller.signal)

    const assertion = expect(transfer).rejects.toThrow('Transfer paused')
    controller.abort()
    await assertion
  })

  it('does not throttle when the rate is unlimited', async () => {
    const bucket = new TokenBucket(0)
    await expect(bucket.take(8 * 1024 * 1024)).resolves.toBeUndefined()
  })
})
