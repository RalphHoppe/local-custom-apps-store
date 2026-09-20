import {
  AppWindow,
  Clipboard,
  CloudSun,
  Code2,
  FileText,
  Headphones,
  Image,
  NotebookPen,
  Palette,
  PanelsTopLeft,
  ScanLine,
  Sparkles,
  Timer,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { StoreApp } from '../types'

const icons: Record<string, LucideIcon> = {
  panels: PanelsTopLeft,
  timer: Timer,
  notebook: NotebookPen,
  scan: ScanLine,
  'cloud-sun': CloudSun,
  palette: Palette,
  clipboard: Clipboard,
  headphones: Headphones,
  image: Image,
  code: Code2,
  file: FileText,
  tools: Wrench,
  app: AppWindow,
}

interface AppIconProps {
  app: Pick<StoreApp, 'name' | 'icon' | 'accent'> & { iconImage?: string }
  size?: 'small' | 'medium' | 'large' | 'hero'
}

export function AppIcon({ app, size = 'medium' }: AppIconProps) {
  const Icon = icons[app.icon] ?? Sparkles
  return (
    <div className={`app-icon app-icon--${size} accent-${app.accent} ${app.iconImage ? 'app-icon--image' : ''}`} aria-label={`${app.name} icon`}>
      {app.iconImage ? <img src={app.iconImage} alt="" /> : <Icon aria-hidden="true" strokeWidth={1.9} />}
    </div>
  )
}
