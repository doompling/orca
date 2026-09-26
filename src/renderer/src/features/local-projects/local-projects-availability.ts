import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'

export function hasLocalProjectsApi(): boolean {
  return (
    !isPairedWebClientWindow() &&
    typeof window !== 'undefined' &&
    Boolean(window.api?.localProjects)
  )
}
