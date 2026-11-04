import { EventEmitter } from 'node:events'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Device,
  FileEntry,
  Settings,
  Transfer,
  TransferAggregate,
  TransferSnapshot,
  TransferStatus
} from '@shared/types'
import type { DeviceManager } from '../devices/deviceManager'
import type { FileProvider } from '../devices/provider'
import { readJson, writeJson } from '../store'
import { TokenBucket } from './meter'
import { deletePartial, runTransferJob } from './transferJob'
import { walkLocal, walkRemote } from './walk'

const TERMINAL: TransferStatus[] = ['done', 'canceled']
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

const CONNECTION_LOST = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /EPIPE/i,
  /not connected/i,
  /no response from server/i,
  /device offline/i,
  /connection closed/i,
  /socket hang up/i,
  /channel closed/i,
  /adb exited with \d+/i
]

function isConnectionLost(message: string): boolean {
  if (/permission denied|no space left|no such file|ENOENT|EACCES|ENOSPC/i.test(message)) return false
  return CONNECTION_LOST.some((re) => re.test(message))
}

function readable(message: string): string {
  if (/ENOSPC|no space left/i.test(message)) return 'No space left on the device'
  if (/EACCES|EPERM|permission denied/i.test(message)) return 'Permission denied'
  if (/ENOENT|no such file/i.test(message)) return 'File not found'
  return message.replace(/^Error:\s*/i, '')
}

export class TransferManager extends EventEmitter {
  private readonly transfers = new Map<string, Transfer>()
  private readonly runtimes = new Map<string, { controller: AbortController; done: Promise<void> }>()
  private readonly throttle = new TokenBucket(0)
  private emitTimer: NodeJS.Timeout | null = null
  private persistTimer: NodeJS.Timeout | null = null
  private pumping = false
  private initialized = false
  private shuttingDown = false

  constructor(
    private readonly devices: DeviceManager,
    private readonly getSettings: () => Promise<Settings>
  ) {
    super()
    this.devices.on('devices', (list: Device[]) => this.onDevices(list))
  }

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    const stored = await readJson<Transfer[]>('transfers.json', [])
    const now = Date.now()
    for (const job of stored) {
      if (!job?.id || !job.deviceId) continue
      if (TERMINAL.includes(job.status) && job.finishedAt && now - job.finishedAt > SEVEN_DAYS) continue
      job.speedBps = 0
      job.etaSec = null
      if (!TERMINAL.includes(job.status)) {
        job.status = 'paused'
        job.doneBytes = Math.max(0, job.doneBytes || 0)
      }
      this.transfers.set(job.id, job)
    }
    this.scheduleEmit()
  }

  snapshot(): TransferSnapshot {
    return { transfers: this.sorted(), aggregate: this.aggregate() }
  }

  list(): Transfer[] {
    return this.sorted()
  }

  private sorted(): Transfer[] {
    return [...this.transfers.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  private aggregate(): TransferAggregate {
    let downBps = 0
    let upBps = 0
    let active = 0
    let queued = 0
    let paused = 0
    let failed = 0
    let remainingBytes = 0
    let totalBytes = 0
    let doneBytes = 0
    for (const job of this.transfers.values()) {
      const speed = job.status === 'running' ? Math.max(0, job.speedBps) : 0
      if (job.direction === 'download') downBps += speed
      else upBps += speed
      if (job.status === 'running' || job.status === 'verifying') active++
      if (job.status === 'queued') queued++
      if (job.status === 'paused' || job.status === 'waiting-connection') paused++
      if (job.status === 'error') failed++
      if (!TERMINAL.includes(job.status)) {
        remainingBytes += Math.max(0, job.totalBytes - job.doneBytes)
        totalBytes += job.totalBytes
        doneBytes += Math.min(job.doneBytes, job.totalBytes)
      }
    }
    const totalSpeed = downBps + upBps
    return {
      downBps,
      upBps,
      active,
      queued,
      paused,
      failed,
      remainingBytes,
      etaSec: totalSpeed >= 1024 ? remainingBytes / totalSpeed : null,
      overallPct: totalBytes > 0 ? Math.min(100, (doneBytes / totalBytes) * 100) : 0
    }
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emit('update', this.snapshot())
    }, 250)
  }

  private schedulePersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      void this.persist()
    }, 1000)
  }

  async persist(): Promise<void> {
    await writeJson('transfers.json', this.list())
  }

  private onDevices(devices: Device[]): void {
    const connected = new Set(devices.filter((d) => d.status === 'connected').map((d) => d.id))
    let changed = false
    for (const job of this.transfers.values()) {
      if (job.status === 'waiting-connection' && connected.has(job.deviceId)) {
        job.status = 'queued'
        job.error = undefined
        changed = true
      }
    }
    if (changed) {
      this.scheduleEmit()
      void this.pump()
    }
  }

  private newJob(init: Omit<Transfer, 'id' | 'createdAt' | 'speedBps' | 'etaSec' | 'status' | 'doneBytes'>): Transfer {
    const job: Transfer = {
      ...init,
      id: randomUUID(),
      doneBytes: 0,
      status: 'queued',
      speedBps: 0,
      etaSec: null,
      createdAt: Date.now()
    }
    this.transfers.set(job.id, job)
    return job
  }

  private requireDevice(deviceId: string): Device {
    const device = this.devices.get(deviceId)
    if (!device) throw new Error('Device is not connected')
    return device
  }

  private provider(deviceId: string): FileProvider {
    return this.devices.provider(deviceId)
  }

  async addDownload(deviceId: string, entries: FileEntry[], localDir?: string): Promise<void> {
    if (!entries.length) return
    const device = this.requireDevice(deviceId)
    const provider = this.provider(deviceId)
    const settings = await this.getSettings()
    const base = localDir?.trim() ? path.resolve(localDir) : settings.downloadDir
    await fsp.mkdir(base, { recursive: true })

    for (const entry of entries) {
      if (entry.isDir) {
        const tree = await walkRemote(provider, entry.path)
        const rootLocal = path.join(base, entry.name)
        await fsp.mkdir(rootLocal, { recursive: true })
        for (const dir of tree.dirs) {
          await fsp.mkdir(path.join(rootLocal, ...dir.split('/')), { recursive: true })
        }
        for (const file of tree.files) {
          this.newJob({
            deviceId,
            deviceName: device.name,
            direction: 'download',
            name: file.rel,
            localPath: path.join(rootLocal, ...file.rel.split('/')),
            remotePath: file.path,
            totalBytes: file.size
          })
        }
      } else {
        this.newJob({
          deviceId,
          deviceName: device.name,
          direction: 'download',
          name: entry.name,
          localPath: path.join(base, entry.name),
          remotePath: entry.path,
          totalBytes: entry.size
        })
      }
    }
    this.scheduleEmit()
    this.schedulePersist()
    void this.pump()
  }

  async addUpload(deviceId: string, localPaths: string[], remoteDir: string): Promise<void> {
    if (!localPaths.length) return
    const device = this.requireDevice(deviceId)
    const provider = this.provider(deviceId)
    const dir = path.posix.normalize(remoteDir || '/')
    await provider.mkdir(dir)

    for (const localPath of localPaths) {
      const stat = await fsp.stat(localPath).catch(() => null)
      if (!stat) continue
      if (stat.isDirectory()) {
        const tree = await walkLocal(localPath)
        const rootName = path.basename(localPath)
        const rootRemote = path.posix.join(dir, rootName)
        await provider.mkdir(rootRemote)
        for (const sub of tree.dirs) {
          await provider.mkdir(path.posix.join(rootRemote, sub))
        }
        for (const file of tree.files) {
          this.newJob({
            deviceId,
            deviceName: device.name,
            direction: 'upload',
            name: `${rootName}/${file.rel}`,
            localPath: file.path,
            remotePath: path.posix.join(rootRemote, file.rel),
            totalBytes: file.size
          })
        }
      } else if (stat.isFile()) {
        this.newJob({
          deviceId,
          deviceName: device.name,
          direction: 'upload',
          name: path.basename(localPath),
          localPath,
          remotePath: path.posix.join(dir, path.basename(localPath)),
          totalBytes: stat.size
        })
      }
    }
    this.scheduleEmit()
    this.schedulePersist()
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.shuttingDown) return
    this.pumping = true
    try {
      const settings = await this.getSettings()
      this.throttle.setRate(settings.bandwidthLimitKBps * 1024)
      let slots = settings.maxConcurrentTransfers - this.runtimes.size
      if (slots <= 0) return
      for (const job of this.sorted()) {
        if (slots <= 0) break
        if (job.status !== 'queued' || this.runtimes.has(job.id)) continue
        this.begin(job, settings)
        slots--
      }
    } finally {
      this.pumping = false
    }
  }

  private begin(job: Transfer, settings: Settings): void {
    const provider = (() => {
      try {
        return this.devices.provider(job.deviceId)
      } catch {
        return null
      }
    })()
    if (!provider) {
      job.status = 'waiting-connection'
      job.error = undefined
      this.scheduleEmit()
      return
    }
    const controller = new AbortController()
    let finish!: () => void
    const done = new Promise<void>((resolve) => {
      finish = resolve
    })
    this.runtimes.set(job.id, { controller, done })
    job.status = 'running'
    job.error = undefined
    job.speedBps = 0
    job.etaSec = null
    this.scheduleEmit()

    void runTransferJob(job, {
      provider,
      settings,
      signal: controller.signal,
      throttle: settings.bandwidthLimitKBps > 0 ? this.throttle : undefined,
      onProgress: (done, speed, eta) => {
        job.doneBytes = done
        job.speedBps = speed
        job.etaSec = eta
        this.scheduleEmit()
      },
      onStatus: (status) => {
        if (controller.signal.aborted) return
        job.status = status
        this.scheduleEmit()
      }
    })
      .then(() => {
        if (controller.signal.aborted) return
        if (job.status !== 'done') {
          job.status = 'done'
          job.finishedAt = Date.now()
          job.speedBps = 0
          job.etaSec = null
          job.doneBytes = job.totalBytes
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = readable(error instanceof Error ? error.message : String(error))
        job.speedBps = 0
        job.etaSec = null
        if (isConnectionLost(message)) {
          job.status = 'waiting-connection'
        } else {
          job.status = 'error'
          job.error = message
        }
      })
      .finally(() => {
        this.runtimes.delete(job.id)
        finish()
        this.scheduleEmit()
        this.schedulePersist()
        void this.pump()
      })
  }

  private targets(id: string | 'all'): Transfer[] {
    return id === 'all' ? this.list() : this.list().filter((job) => job.id === id)
  }

  async pause(id: string | 'all'): Promise<void> {
    for (const job of this.targets(id)) {
      if (!['running', 'verifying', 'queued', 'waiting-connection'].includes(job.status)) continue
      job.status = 'paused'
      job.speedBps = 0
      job.etaSec = null
      this.runtimes.get(job.id)?.controller.abort()
    }
    this.scheduleEmit()
    this.schedulePersist()
  }

  async resume(id: string | 'all'): Promise<void> {
    for (const job of this.targets(id)) {
      if (job.status !== 'paused' && job.status !== 'waiting-connection') continue
      job.status = 'queued'
      job.error = undefined
      job.speedBps = 0
      job.etaSec = null
    }
    this.scheduleEmit()
    this.schedulePersist()
    void this.pump()
  }

  async retry(id: string | 'all'): Promise<void> {
    for (const job of this.targets(id)) {
      if (job.status !== 'error') continue
      job.status = 'queued'
      job.error = undefined
    }
    this.scheduleEmit()
    this.schedulePersist()
    void this.pump()
  }

  async cancel(id: string, deletePartialFile: boolean): Promise<void> {
    const job = this.transfers.get(id)
    if (!job) return
    job.status = 'canceled'
    job.speedBps = 0
    job.etaSec = null
    job.finishedAt = Date.now()
    const runtime = this.runtimes.get(id)
    runtime?.controller.abort()
    if (runtime) await runtime.done
    if (deletePartialFile) {
      let provider: FileProvider | null = null
      try {
        provider = this.devices.provider(job.deviceId)
      } catch {
        provider = null
      }
      try {
        await deletePartial(job, provider)
      } catch (error) {
        job.error = `Partial file could not be removed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
    this.scheduleEmit()
    this.schedulePersist()
    void this.pump()
  }

  async clearFinished(): Promise<void> {
    for (const [id, job] of [...this.transfers]) {
      if (job.status === 'done' || job.status === 'canceled') this.transfers.delete(id)
    }
    this.scheduleEmit()
    this.schedulePersist()
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    const runtimes = [...this.runtimes.values()]
    for (const runtime of runtimes) runtime.controller.abort()
    await Promise.all(runtimes.map((runtime) => runtime.done))
    this.runtimes.clear()
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    if (this.emitTimer) {
      clearTimeout(this.emitTimer)
      this.emitTimer = null
    }
    for (const job of this.transfers.values()) {
      if (job.status === 'running' || job.status === 'verifying') job.status = 'paused'
      job.speedBps = 0
      job.etaSec = null
    }
    await this.persist()
  }
}
