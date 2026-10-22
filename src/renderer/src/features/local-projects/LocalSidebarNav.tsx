import React from 'react'
import { BookOpen, CalendarClock, Files, List, Search, Smartphone } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAppStore } from '@/store'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { useShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { lazyWithRetry } from '@/lib/lazy-with-retry'
import { HideSidebarMenu } from '@/components/sidebar/sidebar-nav-controls'
import { SetupGuideSidebarEntry } from '@/components/sidebar/SetupGuideSidebarEntry'
import {
  shouldShowAgentDashboardButton,
  shouldShowArtifactsButton,
  shouldShowAutomationsButton,
  shouldShowMobileButton,
  shouldShowSkillsButton
} from '@/components/sidebar/SidebarNav'
import type { GlobalSettings } from '../../../../shared/global-settings-types'

const AgentDashboardSidebarEntry = lazyWithRetry(
  () => import('@/components/sidebar/AgentDashboardSidebarEntry')
)

type NavIcon = {
  key: string
  label: string
  icon: LucideIcon
  active: boolean
  onOpen: () => void
  tourTarget?: string
  hideSetting: keyof Pick<
    GlobalSettings,
    | 'showTasksButton'
    | 'showArtifactsButton'
    | 'showSkillsButton'
    | 'showAutomationsButton'
    | 'showMobileButton'
  >
}

/**
 * Ether fork: Search plus icon buttons in one row, replacing SidebarNav's full-width rows in
 * local mode. Reuses SidebarNav's visibility rules; upstream SidebarNav stays untouched.
 */
export const LocalSidebarNav = React.memo(function LocalSidebarNav() {
  const paletteCombos = useShortcutKeyComboDetails('worktree.palette')
  const openModal = useAppStore((s) => s.openModal)
  const openTaskPage = useAppStore((s) => s.openTaskPage)
  const openArtifactsPage = useAppStore((s) => s.openArtifactsPage)
  const openSkillsPage = useAppStore((s) => s.openSkillsPage)
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openMobilePage = useAppStore((s) => s.openMobilePage)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const activeView = useAppStore((s) => s.activeView)
  const settings = useAppStore((s) => s.settings)
  const icons: NavIcon[] = []
  if (settings?.showTasksButton !== false) {
    icons.push({
      key: 'tasks',
      label: 'Tasks',
      icon: List,
      active: activeView === 'tasks',
      onOpen: () => openTaskPage(),
      tourTarget: 'sidebar-tasks',
      hideSetting: 'showTasksButton'
    })
  }
  if (shouldShowArtifactsButton(settings)) {
    icons.push({
      key: 'artifacts',
      label: 'Artifacts',
      icon: Files,
      active: activeView === 'artifacts',
      onOpen: openArtifactsPage,
      hideSetting: 'showArtifactsButton'
    })
  }
  if (shouldShowSkillsButton(settings)) {
    icons.push({
      key: 'skills',
      label: 'Skills',
      icon: BookOpen,
      active: activeView === 'skills',
      onOpen: openSkillsPage,
      hideSetting: 'showSkillsButton'
    })
  }
  if (shouldShowAutomationsButton(settings)) {
    icons.push({
      key: 'automations',
      label: 'Automations',
      icon: CalendarClock,
      active: activeView === 'automations',
      onOpen: openAutomationsPage,
      hideSetting: 'showAutomationsButton'
    })
  }
  if (shouldShowMobileButton(settings)) {
    icons.push({
      key: 'mobile',
      label: 'Orca Mobile',
      icon: Smartphone,
      active: activeView === 'mobile',
      onOpen: openMobilePage,
      hideSetting: 'showMobileButton'
    })
  }

  return (
    <div
      className="flex flex-col gap-0.5 px-2 pt-2 pb-1"
      data-contextual-tour-target="sidebar-navigation"
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => openModal('worktree-palette')}
          aria-label="Search worktrees and browser tabs"
          className="group flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-worktree-sidebar-foreground/5 px-2 text-left text-[13px] font-medium tracking-tight text-worktree-sidebar-foreground/60 transition-colors hover:bg-worktree-sidebar-foreground/8 focus-visible:ring-2 focus-visible:ring-worktree-sidebar-ring focus-visible:outline-none"
        >
          <Search
            className="size-4 shrink-0 text-worktree-sidebar-foreground/30"
            strokeWidth={1.75}
          />
          <span className="flex-1 truncate">Search</span>
          <span className="pointer-events-none hidden shrink-0 items-center gap-1 group-hover:flex group-focus-within:flex">
            {paletteCombos.map((combo) => (
              <ShortcutKeyCombo
                key={combo.keys.join('-')}
                keys={combo.keys}
                doubleTap={combo.doubleTap}
                className="inline-flex gap-0.5"
                keyCapClassName="min-w-4 border-worktree-sidebar-border/80 bg-worktree-sidebar-foreground/8 px-1 py-px text-[9px] text-worktree-sidebar-foreground/55 shadow-none"
                separatorClassName="text-[9px] text-worktree-sidebar-foreground/45"
              />
            ))}
          </span>
        </button>
        {icons.map((item) => (
          <ContextMenu key={item.key}>
            <Tooltip>
              <ContextMenuTrigger asChild>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={item.label}
                    aria-current={item.active ? 'page' : undefined}
                    data-contextual-tour-target={item.tourTarget}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-worktree-sidebar-foreground/45 transition-colors hover:bg-worktree-sidebar-foreground/8 hover:text-worktree-sidebar-foreground focus-visible:ring-2 focus-visible:ring-worktree-sidebar-ring focus-visible:outline-none aria-[current=page]:bg-worktree-sidebar-accent aria-[current=page]:text-worktree-sidebar-accent-foreground"
                    onClick={item.onOpen}
                  >
                    <item.icon className="size-4" strokeWidth={1.75} />
                  </button>
                </TooltipTrigger>
              </ContextMenuTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {item.label}
              </TooltipContent>
            </Tooltip>
            <HideSidebarMenu onHide={() => void updateSettings({ [item.hideSetting]: false })} />
          </ContextMenu>
        ))}
      </div>
      <SetupGuideSidebarEntry />
      {shouldShowAgentDashboardButton(settings) ? (
        <React.Suspense fallback={null}>
          <AgentDashboardSidebarEntry />
        </React.Suspense>
      ) : null}
    </div>
  )
})
