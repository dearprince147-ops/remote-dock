import { useEffect, useState } from 'react'
import {
  ArrowDownUp,
  Check,
  FolderCog,
  Info,
  Loader2,
  Monitor,
  Palette,
  Plug,
  Trash2
} from 'lucide-react'
import type { KnownHost, Settings } from '@shared/types'
import { useAppStore } from '../store/appStore'
import { ACCENT_PRESETS, isHex } from '../lib/accent'
import { api, errorMessage } from '../lib/api'

type Section = 'appearance' | 'window' | 'transfers' | 'connections' | 'files' | 'about'

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Palette }> = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'window', label: 'Window', icon: Monitor },
  { id: 'transfers', label: 'Transfers', icon: ArrowDownUp },
  { id: 'connections', label: 'Connections', icon: Plug },
  { id: 'files', label: 'Files', icon: FolderCog },
  { id: 'about', label: 'About', icon: Info }
]

export function SettingsPage(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const update = useAppStore((state) => state.updateSettings)
  const toast = useAppStore((state) => state.pushToast)

  const [section, setSection] = useState<Section>('appearance')
  const [knownHosts, setKnownHosts] = useState<KnownHost[]>([])
  const [adbResult, setAdbResult] = useState('')
  const [adbTesting, setAdbTesting] = useState(false)
  const [version, setVersion] = useState('…')
  const [adbVersion, setAdbVersion] = useState('…')
  const [hexDraft, setHexDraft] = useState(settings?.accent ?? '#22c55e')

  useEffect(() => {
    void api.hostkey.list().then(setKnownHosts).catch(() => setKnownHosts([]))
    void api.app.version().then(setVersion).catch(() => setVersion('unknown'))
    void api.app.adbVersion().then(setAdbVersion).catch(() => setAdbVersion('unavailable'))
  }, [])

  useEffect(() => {
    if (settings?.accent) setHexDraft(settings.accent)
  }, [settings?.accent])

  if (!settings) return <div className="page-loading">Loading…</div>

  const set = (patch: Partial<Settings>): void => {
    void update(patch)
  }

  const applyCustom = (): void => {
    if (isHex(hexDraft)) set({ accent: hexDraft.toLowerCase() })
    else setHexDraft(settings.accent)
  }

  const reloadHosts = async (): Promise<void> => {
    try {
      setKnownHosts(await api.hostkey.list())
    } catch (error) {
      toast('error', errorMessage(error))
    }
  }

  const testAdb = async (): Promise<void> => {
    setAdbTesting(true)
    try {
      await update({ adbPathOverride: settings.adbPathOverride })
      const result = await api.app.adbVersion()
      setAdbResult(result)
      setAdbVersion(result)
    } catch (error) {
      setAdbResult(errorMessage(error))
    } finally {
      setAdbTesting(false)
    }
  }

  return (
    <div className="settings-page page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Changes apply immediately and are stored on this machine.</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              className={`settings-nav-item ${section === item.id ? 'active' : ''}`}
              onClick={() => setSection(item.id)}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === 'appearance' && (
            <section className="settings-card">
              <h2>Accent color</h2>
              <p className="setting-section-desc">One accent color is used across buttons, focus rings, selection and progress.</p>
              <div className="swatches">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    className={`swatch ${settings.accent === preset.value ? 'active' : ''}`}
                    style={{ background: preset.value }}
                    title={preset.name}
                    onClick={() => set({ accent: preset.value })}
                  >
                    {settings.accent === preset.value && <Check size={14} />}
                  </button>
                ))}
              </div>
              <div className="custom-accent">
                <input
                  type="color"
                  value={isHex(hexDraft) ? hexDraft : settings.accent}
                  onChange={(event) => {
                    setHexDraft(event.target.value)
                    set({ accent: event.target.value })
                  }}
                  title="Custom color"
                />
                <input
                  className="input hex-input"
                  value={hexDraft}
                  spellCheck={false}
                  onChange={(event) => setHexDraft(event.target.value)}
                  onBlur={applyCustom}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') applyCustom()
                  }}
                />
                <span className="setting-hint">Custom hex color</span>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Default view</div>
                  <div className="setting-desc">How folders open in the explorer.</div>
                </div>
                <div className="segmented">
                  <button className={settings.view === 'list' ? 'active' : ''} onClick={() => set({ view: 'list' })}>
                    List
                  </button>
                  <button className={settings.view === 'grid' ? 'active' : ''} onClick={() => set({ view: 'grid' })}>
                    Grid
                  </button>
                </div>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Speed unit</div>
                  <div className="setting-desc">Show transfer speed as megabytes or megabits.</div>
                </div>
                <div className="segmented">
                  <button className={settings.speedUnit === 'bytes' ? 'active' : ''} onClick={() => set({ speedUnit: 'bytes' })}>
                    MB/s
                  </button>
                  <button className={settings.speedUnit === 'bits' ? 'active' : ''} onClick={() => set({ speedUnit: 'bits' })}>
                    Mbps
                  </button>
                </div>
              </div>
            </section>
          )}

          {section === 'window' && (
            <section className="settings-card">
              <h2>Window</h2>
              <Toggle
                label="Start in fullscreen"
                description="Open RemoteDock fullscreen on launch. Press F11 to toggle at any time."
                checked={settings.startFullscreen}
                onChange={(value) => set({ startFullscreen: value })}
              />
            </section>
          )}

          {section === 'transfers' && (
            <section className="settings-card">
              <h2>Transfers</h2>
              <div className="setting-row">
                <div>
                  <div className="setting-label">Download folder</div>
                  <div className="setting-desc">Where downloaded files are saved by default.</div>
                </div>
                <div className="row-inline">
                  <input className="input path-input-wide" value={settings.downloadDir} readOnly title={settings.downloadDir} />
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      void api.dialog.pickDir('Choose download folder').then((dir) => {
                        if (dir) set({ downloadDir: dir })
                      })
                    }}
                  >
                    Browse
                  </button>
                </div>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Simultaneous transfers</div>
                  <div className="setting-desc">How many files transfer at the same time.</div>
                </div>
                <div className="segmented">
                  {[1, 2, 3, 4].map((value) => (
                    <button
                      key={value}
                      className={settings.maxConcurrentTransfers === value ? 'active' : ''}
                      onClick={() => set({ maxConcurrentTransfers: value })}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Name conflict</div>
                  <div className="setting-desc">What to do when a file with the same name already exists.</div>
                </div>
                <div className="segmented">
                  <button className={settings.conflictPolicy === 'rename' ? 'active' : ''} onClick={() => set({ conflictPolicy: 'rename' })}>
                    Keep both
                  </button>
                  <button className={settings.conflictPolicy === 'overwrite' ? 'active' : ''} onClick={() => set({ conflictPolicy: 'overwrite' })}>
                    Overwrite
                  </button>
                  <button className={settings.conflictPolicy === 'skip' ? 'active' : ''} onClick={() => set({ conflictPolicy: 'skip' })}>
                    Skip
                  </button>
                </div>
              </div>

              <Toggle
                label="Verify integrity with SHA-256"
                description="Hash both sides after each transfer. Safer, but slower for large files."
                checked={settings.verifyHash}
                onChange={(value) => set({ verifyHash: value })}
              />

              <div className="setting-row">
                <div>
                  <div className="setting-label">Bandwidth limit</div>
                  <div className="setting-desc">Shared across all transfers. 0 means unlimited.</div>
                </div>
                <div className="row-inline">
                  <input
                    className="input number-input"
                    inputMode="numeric"
                    value={settings.bandwidthLimitKBps}
                    onChange={(event) => set({ bandwidthLimitKBps: Number(event.target.value.replace(/[^0-9]/g, '') || 0) })}
                  />
                  <span className="setting-hint">KB/s</span>
                </div>
              </div>
            </section>
          )}

          {section === 'connections' && (
            <section className="settings-card">
              <h2>Connections</h2>
              <Toggle
                label="Reconnect automatically"
                description="Retry SSH sessions and Wi-Fi ADB devices after a drop."
                checked={settings.autoReconnect}
                onChange={(value) => set({ autoReconnect: value })}
              />
              <div className="setting-row">
                <div>
                  <div className="setting-label">Maximum reconnect attempts</div>
                  <div className="setting-desc">0 means keep trying until the device comes back.</div>
                </div>
                <input
                  className="input number-input"
                  inputMode="numeric"
                  value={settings.reconnectMaxAttempts}
                  onChange={(event) => set({ reconnectMaxAttempts: Number(event.target.value.replace(/[^0-9]/g, '') || 0) })}
                />
              </div>
              <div className="setting-row">
                <div>
                  <div className="setting-label">Default SSH port</div>
                  <div className="setting-desc">Pre-filled on the Devices page. Use 8022 for many NAS boxes.</div>
                </div>
                <input
                  className="input number-input"
                  inputMode="numeric"
                  value={settings.defaultSshPort}
                  onChange={(event) => set({ defaultSshPort: Number(event.target.value.replace(/[^0-9]/g, '') || 22) })}
                />
              </div>
              <div className="setting-row">
                <div>
                  <div className="setting-label">ADB path override</div>
                  <div className="setting-desc">Leave empty to use the bundled adb.exe, then PATH.</div>
                </div>
                <div className="row-inline">
                  <input
                    className="input path-input-wide"
                    value={settings.adbPathOverride}
                    placeholder="C:\\platform-tools\\adb.exe"
                    spellCheck={false}
                    onChange={(event) => set({ adbPathOverride: event.target.value })}
                  />
                  <button className="btn btn-sm" onClick={() => void testAdb()} disabled={adbTesting}>
                    {adbTesting ? <Loader2 size={13} className="spin" /> : null} Test ADB
                  </button>
                </div>
              </div>
              {(adbResult || adbVersion) && <div className="adb-result">{adbResult || adbVersion}</div>}

              <div className="known-hosts">
                <div className="setting-label">Known hosts</div>
                {knownHosts.length === 0 ? (
                  <div className="setting-hint">No SSH hosts trusted yet.</div>
                ) : (
                  knownHosts.map((host) => (
                    <div className="known-host-row" key={host.key}>
                      <div className="known-host-main">
                        <span className="known-host-name">
                          {host.host}:{host.port}
                        </span>
                        <code className="known-host-fp">{host.fingerprint}</code>
                      </div>
                      <button
                        className="icon-btn danger-hover"
                        title="Remove trusted key"
                        onClick={() => {
                          void api.hostkey
                            .remove(host.key)
                            .then(reloadHosts)
                            .catch((error) => toast('error', errorMessage(error)))
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {section === 'files' && (
            <section className="settings-card">
              <h2>Files</h2>
              <Toggle
                label="Show hidden files"
                description="Show entries whose name starts with a dot. Toggle quickly with Ctrl+H."
                checked={settings.showHidden}
                onChange={(value) => set({ showHidden: value })}
              />
              <Toggle
                label="Confirm before delete"
                description="Ask before removing files or folders on the remote device."
                checked={settings.confirmDelete}
                onChange={(value) => set({ confirmDelete: value })}
              />
            </section>
          )}

          {section === 'about' && (
            <section className="settings-card">
              <h2>About</h2>
              <div className="about-brand">
                <span className="brand-mark large">
                  <ArrowDownUp size={20} />
                </span>
                <div>
                  <div className="about-name">RemoteDock</div>
                  <div className="about-version">Version {version}</div>
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <div className="setting-label">ADB</div>
                  <div className="setting-desc">Android Debug Bridge used for device access.</div>
                </div>
                <code className="about-code">{adbVersion}</code>
              </div>
              <div className="setting-row">
                <div>
                  <div className="setting-label">Data folder</div>
                  <div className="setting-desc">Settings, saved connections and the transfer queue.</div>
                </div>
                <button className="btn btn-sm" onClick={() => void api.shell.openDataFolder()}>
                  Open folder
                </button>
              </div>
              <div className="about-note">
                Drop files onto the explorer to upload. Press F11 for fullscreen, Ctrl+, for settings.
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <div className="setting-row">
      <div>
        <div className="setting-label">{label}</div>
        <div className="setting-desc">{description}</div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="switch-track">
          <span className="switch-thumb" />
        </span>
      </label>
    </div>
  )
}
