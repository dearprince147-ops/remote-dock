import { useEffect, useState } from 'react'
import {
  Cable,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Smartphone,
  Terminal,
  Trash2,
  Wifi
} from 'lucide-react'
import type { AdbConnectConfig, SavedConnection, SshConfig } from '@shared/types'
import { useAppStore } from '../store/appStore'
import { api, errorMessage } from '../lib/api'

type Tab = 'ssh' | 'adb'
type AdbMode = 'usb' | 'wifi'

export function DevicesPage(): React.JSX.Element {
  const devices = useAppStore((state) => state.devices)
  const settings = useAppStore((state) => state.settings)
  const openDevice = useAppStore((state) => state.openDevice)
  const toast = useAppStore((state) => state.pushToast)
  const confirm = useAppStore((state) => state.confirm)

  const [tab, setTab] = useState<Tab>('ssh')
  const [saved, setSaved] = useState<SavedConnection[]>([])
  const [savedVersion, setSavedVersion] = useState(0)

  const [host, setHost] = useState('')
  const [port, setPort] = useState(String(settings?.defaultSshPort ?? 22))
  const [username, setUsername] = useState('')
  const [auth, setAuth] = useState<'password' | 'key'>('password')
  const [password, setPassword] = useState('')
  const [keyPath, setKeyPath] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [save, setSave] = useState(true)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [adbMode, setAdbMode] = useState<AdbMode>('usb')
  const [adbHost, setAdbHost] = useState('')
  const [adbPort, setAdbPort] = useState('5555')
  const [adbBusy, setAdbBusy] = useState(false)
  const [adbError, setAdbError] = useState<string | null>(null)
  const [connectingSaved, setConnectingSaved] = useState<string | null>(null)

  useEffect(() => {
    void api.saved
      .list()
      .then(setSaved)
      .catch((error) => toast('error', errorMessage(error)))
  }, [savedVersion, toast])

  useEffect(() => {
    if (settings?.defaultSshPort) setPort((current) => (current === '22' ? String(settings.defaultSshPort) : current))
  }, [settings?.defaultSshPort])

  const adbDevices = devices.filter((device) => device.kind === 'adb')

  const connectSsh = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setFormError(null)
    if (!host.trim()) return setFormError('Enter a host name or IP address')
    if (!username.trim()) return setFormError('Enter a username')
    if (auth === 'key' && !keyPath) return setFormError('Choose a private key file')
    if (auth === 'key') {
      try {
        await api.app.pathForFile(new File([], keyPath))
      } catch {
        return setFormError('Private key file not found — check the path.')
      }
    }
    const portNumber = Number(port)
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      return setFormError('Port must be between 1 and 65535')
    }
    const config: SshConfig = {
      host: host.trim(),
      port: portNumber,
      username: username.trim(),
      auth,
      password: auth === 'password' ? password : undefined,
      privateKeyPath: auth === 'key' ? keyPath : undefined,
      passphrase: auth === 'key' ? passphrase : undefined,
      save
    }
    setBusy(true)
    try {
      const device = await api.devices.connectSsh(config)
      toast('success', `Connected to ${device.name}`)
      if (save) setSavedVersion((value) => value + 1)
      openDevice(device.id)
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const connectAdb = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setAdbError(null)
    const config: AdbConnectConfig =
      adbMode === 'usb'
        ? { mode: 'usb' }
        : { mode: 'wifi', host: adbHost.trim(), port: Number(adbPort) }
    if (adbMode === 'wifi') {
      if (!adbHost.trim()) return setAdbError('Enter the device IP address')
      const portNumber = Number(adbPort)
      if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
        return setAdbError('Port must be between 1 and 65535')
      }
    }
    setAdbBusy(true)
    try {
      const list = await api.devices.connectAdb(config)
      await useAppStore.getState().refreshDevices()
      toast('success', `Found ${list.length} ADB device${list.length === 1 ? '' : 's'}`)
      if (adbMode === 'usb') setTab('adb')
    } catch (error) {
      setAdbError(errorMessage(error))
    } finally {
      setAdbBusy(false)
    }
  }

  const chooseKey = async (): Promise<void> => {
    const paths = await api.dialog.pickFiles()
    if (paths[0]) setKeyPath(paths[0])
  }

  const connectSaved = async (connection: SavedConnection): Promise<void> => {
    setConnectingSaved(connection.id)
    try {
      const device = await api.saved.connect(connection.id)
      toast('success', `Connected to ${device.name}`)
      openDevice(device.id)
    } catch (error) {
      toast('error', errorMessage(error))
    } finally {
      setConnectingSaved(null)
    }
  }

  const removeSaved = async (connection: SavedConnection): Promise<void> => {
    const result = await confirm({
      title: `Forget “${connection.name}”?`,
      message: 'The saved connection and its encrypted password will be removed.',
      confirmLabel: 'Forget',
      danger: true
    })
    if (!result.ok) return
    try {
      await api.saved.delete(connection.id)
      setSavedVersion((value) => value + 1)
      toast('success', 'Saved connection removed')
    } catch (error) {
      toast('error', errorMessage(error))
    }
  }

  const disconnect = async (id: string): Promise<void> => {
    try {
      await api.devices.disconnect(id)
      await useAppStore.getState().refreshDevices()
    } catch (error) {
      toast('error', errorMessage(error))
    }
  }

  return (
    <div className="devices-page page">
      <div className="page-head">
        <div>
          <h1>Devices</h1>
          <p>Connect to an Android device over ADB, or a machine over SSH.</p>
        </div>
        <button className="btn" onClick={() => void useAppStore.getState().refreshDevices()} title="Refresh device list">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <section className="card connect-card">
        <div className="tabs">
          <button className={`tab ${tab === 'ssh' ? 'active' : ''}`} onClick={() => setTab('ssh')}>
            <Terminal size={15} /> SSH / SFTP
          </button>
          <button className={`tab ${tab === 'adb' ? 'active' : ''}`} onClick={() => setTab('adb')}>
            <Smartphone size={15} /> ADB
          </button>
        </div>

        {tab === 'ssh' ? (
          <form className="connect-form" onSubmit={(event) => void connectSsh(event)}>
            <div className="form-row">
              <label className="field grow">
                <span>Host</span>
                <input
                  className="input"
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="192.168.1.20 or server.local"
                  spellCheck={false}
                />
              </label>
              <label className="field port-field">
                <span>Port</span>
                <input
                  className="input"
                  value={port}
                  inputMode="numeric"
                  onChange={(event) => setPort(event.target.value.replace(/[^0-9]/g, ''))}
                />
                <span className="port-chips">
                  <button type="button" className={port === '22' ? 'on' : ''} onClick={() => setPort('22')}>
                    22
                  </button>
                  <button type="button" className={port === '8022' ? 'on' : ''} onClick={() => setPort('8022')}>
                    8022
                  </button>
                </span>
              </label>
              <label className="field grow">
                <span>Username</span>
                <input
                  className="input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="root"
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="form-row">
              <div className="field grow">
                <span>Authentication</span>
                <div className="segmented">
                  <button type="button" className={auth === 'password' ? 'active' : ''} onClick={() => setAuth('password')}>
                    <Lock size={13} /> Password
                  </button>
                  <button type="button" className={auth === 'key' ? 'active' : ''} onClick={() => setAuth('key')}>
                    <KeyRound size={13} /> Private key
                  </button>
                </div>
              </div>
              {auth === 'password' ? (
                <label className="field grow">
                  <span>Password</span>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="off"
                  />
                </label>
              ) : (
                <>
                  <label className="field grow">
                    <span>Key file</span>
                    <div className="input-with-button">
                      <input className="input" value={keyPath} readOnly placeholder="~/.ssh/id_ed25519" />
                      <button type="button" className="btn btn-sm" onClick={() => void chooseKey()}>
                        Browse
                      </button>
                    </div>
                  </label>
                  <label className="field grow">
                    <span>Passphrase</span>
                    <input
                      className="input"
                      type="password"
                      value={passphrase}
                      onChange={(event) => setPassphrase(event.target.value)}
                      placeholder="Optional"
                      autoComplete="off"
                    />
                  </label>
                </>
              )}
            </div>

            <div className="form-footer">
              <label className="checkbox-row">
                <input type="checkbox" checked={save} onChange={(event) => setSave(event.target.checked)} />
                <span>Save this connection</span>
              </label>
              {formError && (
                <span className="form-error" title={formError}>
                  {formError}
                </span>
              )}
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </form>
        ) : (
          <form className="connect-form" onSubmit={(event) => void connectAdb(event)}>
            <div className="segmented adb-mode">
              <button type="button" className={adbMode === 'usb' ? 'active' : ''} onClick={() => setAdbMode('usb')}>
                <Cable size={14} /> USB
              </button>
              <button type="button" className={adbMode === 'wifi' ? 'active' : ''} onClick={() => setAdbMode('wifi')}>
                <Wifi size={14} /> Wi-Fi
              </button>
            </div>

            {adbMode === 'usb' ? (
              <div className="adb-usb">
                <p>
                  Plug in a phone with USB debugging enabled. Accept the authorization prompt on the device — it will
                  appear below automatically.
                </p>
                <span className="adb-detected">
                  {adbDevices.length} ADB device{adbDevices.length === 1 ? '' : 's'} detected
                </span>
              </div>
            ) : (
              <div className="form-row">
                <label className="field grow">
                  <span>Host</span>
                  <input
                    className="input"
                    value={adbHost}
                    onChange={(event) => setAdbHost(event.target.value)}
                    placeholder="192.168.1.40"
                    spellCheck={false}
                  />
                </label>
                <label className="field port-field">
                  <span>Port</span>
                  <input
                    className="input"
                    value={adbPort}
                    inputMode="numeric"
                    onChange={(event) => setAdbPort(event.target.value.replace(/[^0-9]/g, ''))}
                  />
                  <span className="port-chips">
                    <button type="button" className={adbPort === '5555' ? 'on' : ''} onClick={() => setAdbPort('5555')}>
                      5555
                    </button>
                  </span>
                </label>
              </div>
            )}

            <div className="form-footer">
              {adbError && (
                <span className="form-error" title={adbError}>
                  {adbError}
                </span>
              )}
              <button className="btn btn-primary" type="submit" disabled={adbBusy}>
                {adbBusy ? <Loader2 size={15} className="spin" /> : adbMode === 'wifi' ? <Wifi size={15} /> : <RefreshCw size={15} />}
                {adbMode === 'wifi' ? 'Connect' : 'Scan for devices'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Connected devices</h2>
          <span className="section-count">{devices.length}</span>
        </div>
        {devices.length === 0 ? (
          <div className="empty-state compact">
            <Smartphone size={34} />
            <h3>No devices yet</h3>
            <p>Connect with SSH, or plug in a phone with USB debugging.</p>
          </div>
        ) : (
          <div className="device-grid">
            {devices.map((device) => (
              <div
                key={device.id}
                className={`device-card status-${device.status}`}
                onClick={() => device.status !== 'disconnected' && openDevice(device.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && device.status !== 'disconnected') openDevice(device.id)
                }}
              >
                <div className={`device-icon ${device.kind}`}>
                  {device.kind === 'adb' ? <Smartphone size={21} /> : <Terminal size={21} />}
                </div>
                <div className="device-info">
                  <div className="device-name">{device.name}</div>
                  <div className="device-sub">{device.subtitle}</div>
                  <div className="device-status">
                    <span className={`dot ${device.status}`} />
                    <span>
                      {device.status === 'connected'
                        ? 'Connected'
                        : device.status === 'unauthorized'
                          ? 'Authorization needed'
                          : device.status === 'reconnecting'
                            ? device.statusDetail ?? 'Reconnecting…'
                            : 'Disconnected'}
                    </span>
                  </div>
                  {device.status === 'unauthorized' && (
                    <div className="device-hint">Accept the USB debugging prompt on your phone.</div>
                  )}
                </div>
                <div className="device-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={(event) => {
                      event.stopPropagation()
                      openDevice(device.id)
                    }}
                    disabled={device.status === 'disconnected'}
                  >
                    Open
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      void disconnect(device.id)
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Saved connections</h2>
          <span className="section-count">{saved.length}</span>
        </div>
        {saved.length === 0 ? (
          <div className="saved-empty">Saved SSH connections will show up here.</div>
        ) : (
          <div className="saved-list">
            {saved.map((connection) => (
              <div className="saved-row" key={connection.id}>
                <span className="saved-icon">
                  <Terminal size={15} />
                </span>
                <span className="saved-name">{connection.name}</span>
                <span className="saved-sub">
                  {connection.username}@{connection.host}:{connection.port}
                </span>
                <span className="saved-auth">{connection.auth === 'key' ? 'Key' : 'Password'}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => void connectSaved(connection)}
                  disabled={connectingSaved === connection.id}
                >
                  {connectingSaved === connection.id ? <Loader2 size={13} className="spin" /> : null}
                  Connect
                </button>
                <button className="icon-btn danger-hover" onClick={() => void removeSaved(connection)} title="Forget connection">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
