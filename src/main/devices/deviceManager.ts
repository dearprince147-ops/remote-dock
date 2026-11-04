import { EventEmitter } from 'node:events'
import path from 'node:path'
import type { AdbConnectConfig, Device, Settings, SshConfig } from '@shared/types'
import { AdbProvider, AdbTracker, adbDeviceName, adbSubtitle, isWifiSerial } from './adbDevice'
import type { AdbDeviceInfo } from './adbParse'
import { addHost } from './hostKeys'
import { HostKeyChangedError, HostKeyUnknownError, SshDevice, type SshDeviceOptions } from './sshDevice'
import type { FileProvider } from './provider'

interface DeviceEntry {
  device: Device
  provider: FileProvider | null
  kind: 'ssh' | 'adb'
  ssh?: SshDeviceOptions
  adb?: { serial: string; wifi?: { host: string; port: number } }
  reconnectAttempts: number
  reconnectTimer: NodeJS.Timeout | null
  reconnecting: boolean
}

export interface DeviceManagerOptions {
  getSettings: () => Promise<Settings>
  promptHostKey: (host: string, port: number, fingerprint: string, changed: boolean) => Promise<boolean>
}

const BACKOFF = [1, 2, 4, 8, 15, 30]

function sshDeviceId(config: SshConfig): string {
  return `ssh:${config.username}@${config.host}:${config.port}`
}

function sshOptions(config: SshConfig): SshDeviceOptions {
  return {
    host: config.host.trim(),
    port: config.port,
    username: config.username.trim(),
    auth: config.auth,
    password: config.password,
    privateKeyPath: config.privateKeyPath,
    passphrase: config.passphrase
  }
}

export function readableError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (/ECONNREFUSED/i.test(message)) return new Error('Connection refused — check the host and port.')
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) return new Error('Host not found — check the address.')
  if (/EHOSTUNREACH|ENETUNREACH/i.test(message)) return new Error('Host unreachable — check your network.')
  if (/authentication|All configured authentication methods failed/i.test(message)) {
    return new Error('Authentication failed — check the username, password or key.')
  }
  if (/timed out|ETIMEDOUT/i.test(message)) return new Error('Connection timed out.')
  if (/ENOENT/i.test(message)) return new Error('Private key file not found — check the path.')
  if (/bad passphrase|incorrect passphrase|wrong passphrase/i.test(message)) {
    return new Error('Wrong passphrase for the private key.')
  }
  if (/invalid.*key|key format|unsupported key|not a valid.*key/i.test(message)) {
    return new Error('Invalid private key format — use OpenSSH format (not PuTTY .ppk).')
  }
  if (/host key|hostkey|verify.*host|fingerprint/i.test(message)) {
    return new Error('Host key verification failed — the server\'s identity could not be confirmed.')
  }
  if (/permission denied/i.test(message)) return new Error('Permission denied — check credentials and server config.')
  if (/algorithm|kex|key exchange/i.test(message)) {
    return new Error('Key exchange failed — the server may use outdated algorithms.')
  }
  if (/Packet length \d+ exceeds max length|Received too large .* SFTP packet|bad packet length/i.test(message)) {
    return new Error(
      'SFTP failed: Remote shell printed text (banner / MOTD / echo in ~/.bashrc) before SFTP started. Use "Subsystem sftp internal-sftp" in sshd_config or guard ~/.bashrc.'
    )
  }
  return new Error(message)
}

export class DeviceManager extends EventEmitter {
  private readonly entries = new Map<string, DeviceEntry>()
  private readonly tracker = new AdbTracker()
  private readonly hiddenAdb = new Set<string>()
  private started = false

  constructor(private readonly options: DeviceManagerOptions) {
    super()
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.tracker.on('devices', (devices: AdbDeviceInfo[]) => this.syncAdb(devices))
    this.tracker.start()
  }

  stop(): void {
    this.tracker.stop()
    for (const entry of this.entries.values()) {
      this.clearTimer(entry)
      entry.provider?.dispose()
    }
    this.entries.clear()
    this.started = false
  }

  list(): Device[] {
    return [...this.entries.values()]
      .map((entry) => entry.device)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  }

  get(id: string): Device | undefined {
    return this.entries.get(id)?.device
  }

  provider(id: string): FileProvider {
    const entry = this.entries.get(id)
    if (!entry) throw new Error('Device is not connected')
    if (!entry.provider) throw new Error('Device is not ready yet')
    if (entry.device.status === 'unauthorized') throw new Error('Authorize USB debugging on the device first')
    return entry.provider
  }

  private emitDevices(): void {
    this.emit('devices', this.list())
  }

  private clearTimer(entry: DeviceEntry): void {
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer)
    entry.reconnectTimer = null
  }

  async connectSsh(config: SshConfig): Promise<Device> {
    if (!config.host?.trim()) throw new Error('Host is required')
    if (!config.username?.trim()) throw new Error('Username is required')
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Port must be 1-65535')

    const id = sshDeviceId(config)
    const existing = this.entries.get(id)
    if (existing?.device.status === 'connected') return existing.device
    if (existing) {
      this.clearTimer(existing)
      existing.provider?.dispose()
      this.entries.delete(id)
    }

    const opts = sshOptions(config)
    let device = new SshDevice(opts)
    let connected = false
    let lastError: unknown = null

    for (let attempt = 0; attempt < 2 && !connected; attempt++) {
      try {
        await device.connect()
        connected = true
      } catch (error) {
        lastError = error
        if (error instanceof HostKeyUnknownError) {
          const accepted = await this.options.promptHostKey(
            error.host,
            error.port,
            error.fingerprint,
            false
          )
          if (!accepted) {
            device.dispose()
            throw new Error('The host key was rejected.')
          }
          await addHost(error.host, error.port, error.fingerprint)
          device.dispose()
          device = new SshDevice(opts)
          continue
        }
        if (error instanceof HostKeyChangedError) {
          device.dispose()
          throw new Error(error.message)
        }
        device.dispose()
        throw readableError(error)
      }
    }

    if (!connected) {
      device.dispose()
      throw readableError(lastError)
    }

    const name = config.name?.trim() || config.username.trim()
    const entry: DeviceEntry = {
      device: {
        id,
        kind: 'ssh',
        name,
        subtitle: `${config.username}@${config.host}:${config.port}`,
        status: 'connected'
      },
      provider: device,
      kind: 'ssh',
      ssh: opts,
      reconnectAttempts: 0,
      reconnectTimer: null,
      reconnecting: false
    }
    this.entries.set(id, entry)
    this.watchSsh(id, device)
    this.emitDevices()
    return entry.device
  }

  private watchSsh(id: string, device: SshDevice): void {
    device.on('lost', () => {
      const entry = this.entries.get(id)
      if (!entry || entry.reconnecting) return
      entry.provider = null
      void this.scheduleReconnect(entry)
    })
  }

  private async scheduleReconnect(entry: DeviceEntry): Promise<void> {
    const settings = await this.options.getSettings()
    const id = entry.device.id
    if (!this.entries.has(id)) return
    if (!settings.autoReconnect) {
      entry.device.status = 'disconnected'
      entry.device.statusDetail = 'Disconnected'
      this.emitDevices()
      return
    }
    const max = settings.reconnectMaxAttempts
    if (max > 0 && entry.reconnectAttempts >= max) {
      entry.device.status = 'disconnected'
      entry.device.statusDetail = `Gave up after ${max} attempts`
      this.emitDevices()
      return
    }
    entry.reconnecting = true
    const delay = BACKOFF[Math.min(entry.reconnectAttempts, BACKOFF.length - 1)]
    entry.reconnectAttempts += 1
    entry.device.status = 'reconnecting'
    entry.device.statusDetail = `Retrying in ${delay}s (attempt ${entry.reconnectAttempts}${max > 0 ? `/${max}` : ''})`
    this.emitDevices()
    this.clearTimer(entry)
    entry.reconnectTimer = setTimeout(() => void this.tryReconnect(entry), delay * 1000)
  }

  private async tryReconnect(entry: DeviceEntry): Promise<void> {
    entry.reconnectTimer = null
    const id = entry.device.id
    if (!this.entries.has(id) || !entry.reconnecting) return

    if (entry.kind === 'ssh' && entry.ssh) {
      const device = new SshDevice(entry.ssh)
      try {
        await device.connect()
        entry.provider = device
        entry.device.status = 'connected'
        entry.device.statusDetail = undefined
        entry.reconnectAttempts = 0
        entry.reconnecting = false
        this.watchSsh(id, device)
        this.emitDevices()
      } catch (error) {
        device.dispose()
        entry.reconnectAttempts += 1
        entry.reconnecting = false
        if (error instanceof HostKeyChangedError) {
          entry.device.status = 'disconnected'
          entry.device.statusDetail = 'Host key changed — connection blocked'
          this.emitDevices()
          return
        }
        await this.scheduleReconnect(entry)
      }
      return
    }

    if (entry.kind === 'adb' && entry.adb?.wifi) {
      try {
        await this.tracker.connectWifi(entry.adb.wifi.host, entry.adb.wifi.port)
        entry.reconnectAttempts = 0
        entry.reconnecting = false
        await this.tracker.poll()
      } catch {
        entry.reconnecting = false
        await this.scheduleReconnect(entry)
      }
    }
  }

  async connectAdb(config: AdbConnectConfig): Promise<Device[]> {
    if (config.mode === 'wifi') {
      if (!config.host?.trim()) throw new Error('Host is required')
      if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Port must be 1-65535')
      await this.tracker.connectWifi(config.host.trim(), config.port)
    } else {
      await this.tracker.poll()
    }
    return this.list().filter((device) => device.kind === 'adb')
  }

  async disconnect(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    this.clearTimer(entry)
    entry.reconnecting = false
    entry.provider?.dispose()
    if (entry.kind === 'adb' && entry.adb) {
      this.hiddenAdb.add(entry.adb.serial)
      if (entry.adb.wifi) await this.tracker.disconnectWifi(entry.adb.wifi.host, entry.adb.wifi.port)
    }
    this.entries.delete(id)
    this.emitDevices()
  }

  private syncAdb(devices: AdbDeviceInfo[]): void {
    const seen = new Set<string>()
    let changed = false
    for (const info of devices) {
      const id = `adb:${info.serial}`
      seen.add(id)
      if (this.hiddenAdb.has(info.serial)) continue
      const wifi = isWifiSerial(info.serial)
        ? {
            host: info.serial.slice(0, info.serial.lastIndexOf(':')),
            port: Number(info.serial.slice(info.serial.lastIndexOf(':') + 1))
          }
        : undefined
      const existing = this.entries.get(id)
      if (!existing) {
        const entry: DeviceEntry = {
          device: {
            id,
            kind: 'adb',
            name: adbDeviceName(info),
            subtitle: adbSubtitle(info),
            status: info.state === 'device' ? 'connected' : info.state === 'unauthorized' ? 'unauthorized' : 'reconnecting',
            statusDetail:
              info.state === 'unauthorized'
                ? 'Accept the USB debugging prompt on the device'
                : info.state === 'offline'
                  ? 'Device is offline'
                  : undefined
          },
          provider: new AdbProvider(info.serial),
          kind: 'adb',
          adb: { serial: info.serial, wifi },
          reconnectAttempts: 0,
          reconnectTimer: null,
          reconnecting: false
        }
        this.entries.set(id, entry)
        changed = true
        continue
      }
      const nextStatus: Device['status'] =
        info.state === 'device' ? 'connected' : info.state === 'unauthorized' ? 'unauthorized' : 'reconnecting'
      if (existing.device.status !== nextStatus) {
        existing.device.status = nextStatus
        existing.device.statusDetail =
          nextStatus === 'unauthorized'
            ? 'Accept the USB debugging prompt on the device'
            : nextStatus === 'reconnecting'
              ? 'Device is offline'
              : undefined
        if (nextStatus === 'connected') {
          this.clearTimer(existing)
          existing.reconnecting = false
          existing.reconnectAttempts = 0
        }
        changed = true
      }
      if (existing.device.name !== adbDeviceName(info) || existing.device.subtitle !== adbSubtitle(info)) {
        existing.device.name = adbDeviceName(info)
        existing.device.subtitle = adbSubtitle(info)
        changed = true
      }
    }

    for (const [id, entry] of [...this.entries]) {
      if (entry.kind !== 'adb' || seen.has(id)) continue
      const serial = entry.adb?.serial ?? ''
      this.hiddenAdb.delete(serial)
      if (entry.adb?.wifi) {
        if (entry.device.status !== 'reconnecting') {
          entry.device.status = 'reconnecting'
          entry.device.statusDetail = 'Wi-Fi device lost — reconnecting'
          changed = true
        }
        if (!entry.reconnecting) void this.scheduleReconnect(entry)
        continue
      }
      entry.provider?.dispose()
      this.entries.delete(id)
      changed = true
    }

    if (changed) this.emitDevices()
  }

  static joinRemote(dir: string, name: string): string {
    return path.posix.join(dir, name)
  }
}
