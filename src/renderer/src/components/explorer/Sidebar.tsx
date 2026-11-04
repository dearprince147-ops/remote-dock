import { useState } from 'react'
import { Camera, ChevronLeft, Download, Folder, HardDrive, Home, Image, Music, Server, Smartphone, Video } from 'lucide-react'
import type { QuickLinkIcon } from '@shared/types'
import { useExplorerStore } from '../../store/explorerStore'

const LINK_ICONS: Record<QuickLinkIcon, typeof Home> = {
  home: Home,
  root: Server,
  storage: Smartphone,
  download: Download,
  image: Image,
  video: Video,
  music: Music,
  camera: Camera,
  folder: Folder
}

interface SidebarProps {
  collapsed: boolean
  onCollapse: () => void
}

export function Sidebar({ collapsed, onCollapse }: SidebarProps): React.JSX.Element | null {
  const links = useExplorerStore((state) => state.links)
  const path = useExplorerStore((state) => state.path)
  const navigate = useExplorerStore((state) => state.navigate)
  const [hovered, setHovered] = useState<string | null>(null)

  if (collapsed) return null

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span>Places</span>
        <button className="icon-btn tiny" onClick={onCollapse} title="Collapse sidebar">
          <ChevronLeft size={15} />
        </button>
      </div>
      <div className="sidebar-links">
        {links.map((link) => {
          const Icon = LINK_ICONS[link.icon] ?? Folder
          const active = path === link.path
          return (
            <button
              key={`${link.label}-${link.path}`}
              className={`sidebar-link ${active ? 'active' : ''}`}
              onClick={() => void navigate(link.path)}
              onMouseEnter={() => setHovered(link.path)}
              onMouseLeave={() => setHovered(null)}
              title={link.path}
            >
              <Icon size={15} />
              <span>{link.label}</span>
              {active && <span className="sidebar-active-bar" />}
            </button>
          )
        })}
      </div>
      <div className="sidebar-foot">
        <HardDrive size={13} />
        <span className="sidebar-path" title={path}>
          {path}
        </span>
        {hovered && <span className="sidebar-tip">{hovered}</span>}
      </div>
    </aside>
  )
}
