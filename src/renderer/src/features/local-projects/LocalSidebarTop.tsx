import { useAppStore } from '@/store'
import { LocalSidebarMarks } from './LocalSidebarMarks'
import { LocalSidebarNav } from './LocalSidebarNav'

/** Ether fork: local-mode replacement for SidebarNav, plus Marks pinned above the Projects header. */
export function LocalSidebarTop(): React.JSX.Element {
  const showMarks = useAppStore((s) => (s.sidebarBody ?? 'workspaces') !== 'agents')
  return (
    <>
      <LocalSidebarNav />
      {showMarks ? <LocalSidebarMarks /> : null}
    </>
  )
}
