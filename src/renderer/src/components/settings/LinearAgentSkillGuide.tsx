import type { ReactNode } from 'react'
import { Check, Circle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  IntegrationStatusPill,
  type IntegrationStatusTone
} from '@/components/integration-status-pill'
import {
  TASK_PROVIDER_SETUP_STATUS_TONE,
  getTaskProviderCompletedSteps,
  getTaskProviderSetupStatus,
  type TaskProviderReadiness
} from './task-source-setup-state'
import { translate } from '@/i18n/i18n'

/** The guide renders the skill row, so unlike other providers those facts are required. */
export type LinearSetupReadiness = TaskProviderReadiness & {
  skillInstalled: boolean
  skillChecking: boolean
  skillUnverifiable: boolean
}

type LinearAgentSkillGuideProps = {
  readiness: LinearSetupReadiness
  onOpenTaskSources: () => void
  onManageLinearAccess: () => void
  skillPanel: ReactNode
}

function SetupStatusIcon({
  done,
  checking,
  unverifiable
}: {
  done: boolean
  checking: boolean
  unverifiable?: boolean
}): React.JSX.Element {
  // Keep a fixed size-5 slot so checking/done/pending never shift the column.
  if (checking) {
    return (
      <span className="flex size-5 items-center justify-center text-muted-foreground">
        <Circle className="size-3.5 animate-pulse motion-reduce:animate-none" />
      </span>
    )
  }
  // Why above `done`: an unvouched-for scan says nothing about the step either
  // way, and painting it as pending is the claim this checklist got wrong.
  if (unverifiable) {
    return (
      <span className="flex size-5 items-center justify-center rounded-full border border-border/70 text-muted-foreground">
        <TriangleAlert className="size-3" />
      </span>
    )
  }
  if (done) {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <Check className="size-3" />
      </span>
    )
  }
  return (
    <span className="flex size-5 items-center justify-center rounded-full border border-border/70 text-muted-foreground">
      <Circle className="size-2.5" />
    </span>
  )
}

type LinearSetupPill = { tone: IntegrationStatusTone; label: string }

function getLinearSetupPill(readiness: LinearSetupReadiness): LinearSetupPill {
  const { completed, total } = getTaskProviderCompletedSteps(readiness)
  const status = getTaskProviderSetupStatus(readiness)
  const tone = TASK_PROVIDER_SETUP_STATUS_TONE[status]
  if (status === 'checking') {
    return {
      tone,
      label: translate('auto.components.settings.LinearAgentSkillGuide.setupChecking', 'Checking…')
    }
  }
  if (status === 'ready') {
    return {
      tone,
      label: translate('auto.components.settings.LinearAgentSkillGuide.browsingReady', 'Ready')
    }
  }
  return {
    tone,
    label: translate(
      'auto.components.settings.LinearAgentSkillGuide.setupProgress',
      '{{done}} of {{total}} ready',
      { done: completed, total }
    )
  }
}

// Task browsing has two requirements; agent tooling remains a separate option.
export function LinearAgentSkillGuide({
  readiness,
  onOpenTaskSources,
  onManageLinearAccess,
  skillPanel
}: LinearAgentSkillGuideProps): React.JSX.Element {
  const pill = getLinearSetupPill(readiness)

  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-card/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">
            {translate(
              'auto.components.settings.LinearAgentSkillGuide.setupTitle',
              'Setup checklist'
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.LinearAgentSkillGuide.browsingSetupBody',
              'Connect Linear and show it in Tasks to browse issues and link Workspaces. The agent skill below is optional.'
            )}
          </p>
        </div>
        <IntegrationStatusPill tone={pill.tone}>{pill.label}</IntegrationStatusPill>
      </div>

      <div className="divide-y divide-border/50">
        <div className="flex flex-wrap items-start gap-3 py-3">
          <div className="mt-0.5">
            <SetupStatusIcon done={readiness.connected} checking={readiness.checking} />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              {translate(
                'auto.components.settings.LinearAgentSkillGuide.setupConnectTitle',
                '1. Connect Linear'
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.LinearAgentSkillGuide.browsingConnectBody',
                'Personal API key to browse Linear issues and link them to Workspaces.'
              )}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant={readiness.connected ? 'outline' : 'default'}
            className="shrink-0"
            onClick={onManageLinearAccess}
          >
            {readiness.connected
              ? translate(
                  'auto.components.settings.LinearAgentSkillGuide.manageKeys',
                  'Manage keys'
                )
              : translate('auto.components.settings.LinearAgentSkillGuide.addAccess', 'Add access')}
          </Button>
        </div>

        <div className="flex flex-wrap items-start gap-3 py-3">
          <div className="mt-0.5">
            <SetupStatusIcon done={readiness.visible} checking={false} />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              {translate(
                'auto.components.settings.LinearAgentSkillGuide.browsingVisibleTitle',
                '2. Show Linear in Tasks'
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.LinearAgentSkillGuide.setupVisibleBody',
                'Keeps Linear in the Tasks source picker and sidebar shortcuts.'
              )}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant={readiness.visible ? 'outline' : 'default'}
            className="shrink-0"
            onClick={onOpenTaskSources}
          >
            {translate(
              'auto.components.settings.LinearAgentSkillGuide.openTaskSources',
              'Task Sources'
            )}
          </Button>
        </div>
        <div className="space-y-3 py-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="mt-0.5">
              <SetupStatusIcon
                done={readiness.skillInstalled}
                checking={readiness.skillChecking}
                unverifiable={readiness.skillUnverifiable}
              />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {translate(
                  'auto.components.settings.LinearAgentSkillGuide.optionalSkillTitle',
                  'Optional: Linear agent skill'
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.LinearAgentSkillGuide.optionalSkillBody',
                  'Adds /orca-linear for agents that support skills. Browsing issues and linking Workspaces work without it.'
                )}
              </p>
            </div>
          </div>
          {skillPanel}
        </div>
      </div>
    </section>
  )
}
