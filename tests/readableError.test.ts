import { describe, expect, it } from 'vitest'
import { readableError } from '../src/main/devices/deviceManager'

describe('readableError', () => {
  it('translates SFTP packet length errors with actionable advice', () => {
    const err = new Error('Packet length 169877531 exceeds max length of 262144')
    const mapped = readableError(err)
    expect(mapped.message).toContain('SFTP failed: Remote shell printed text')
    expect(mapped.message).toContain('internal-sftp')
  })

  it('translates other common SSH connection errors', () => {
    expect(readableError(new Error('connect ECONNREFUSED 192.168.1.5:8022')).message).toContain('Connection refused')
    expect(readableError(new Error('All configured authentication methods failed')).message).toContain('Authentication failed')
    expect(readableError(new Error('getaddrinfo ENOTFOUND myhost')).message).toContain('Host not found')
  })
})
