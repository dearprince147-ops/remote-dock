import { useEffect } from 'react'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { TransfersDrawer } from './components/TransfersDrawer'
import { Toasts } from './components/Toasts'
import { ConfirmDialog } from './components/ConfirmDialog'
import { PromptDialog } from './components/PromptDialog'
import { HostKeyDialog } from './components/HostKeyDialog'
import { PreviewDialog } from './components/PreviewDialog'
import { DevicesPage } from './pages/DevicesPage'
import { ExplorerPage } from './pages/ExplorerPage'
import { SettingsPage } from './pages/SettingsPage'
import { initApp, useAppStore } from './store/appStore'
import { useTransferStore } from './store/transferStore'
import { installHotkeys } from './lib/hotkeys'

export default function App(): React.JSX.Element {
  const ready = useAppStore((state) => state.ready)
  const view = useAppStore((state) => state.view)

  useEffect(() => {
    void initApp()
    void useTransferStore.getState().init()
    return installHotkeys()
  }, [])

  if (!ready) {
    return (
      <div className="app">
        <div className="page-loading">Starting RemoteDock…</div>
      </div>
    )
  }

  return (
    <div className="app">
      <Header />
      <div className="app-content">
        {view === 'devices' && <DevicesPage />}
        {view === 'explorer' && <ExplorerPage />}
        {view === 'settings' && <SettingsPage />}
      </div>
      <Footer />
      <TransfersDrawer />
      <Toasts />
      <ConfirmDialog />
      <PromptDialog />
      <HostKeyDialog />
      <PreviewDialog />
    </div>
  )
}
