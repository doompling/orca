import { useState } from 'react'
import { LinearApiKeyDialog } from '@/components/linear-api-key-dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { ORCA_LINEAR_SKILL_NAME } from '@/lib/agent-feature-skill-names'
import { AgentSkillSetupPanel } from '@/components/settings/AgentSkillSetupPanel'
import { TaskSourceShowInTasksStep } from '@/components/settings/TaskSourceShowInTasksStep'
import { TaskSourceStepRow } from '@/components/settings/TaskSourceStepRow'
import { useLinearAgentSkillSetup } from '@/components/settings/use-linear-agent-skill-setup'
import { translate } from '@/i18n/i18n'

type LinearOptionalSkillTaskSourceSetupProps = {
  connected: boolean
  checking: boolean
  visible: boolean
  onToggleVisible: () => void
  onOpenIntegrations: () => void
  canHide: boolean
}

// Browsing setup is independent of the optional agent skill.
export function LinearOptionalSkillTaskSourceSetup({
  connected,
  checking,
  visible,
  onToggleVisible,
  onOpenIntegrations,
  canHide
}: LinearOptionalSkillTaskSourceSetupProps): React.JSX.Element {
  const checkLinearConnection = useAppStore((s) => s.checkLinearConnection)
  const [dialogOpen, setDialogOpen] = useState(false)
  const skillSetup = useLinearAgentSkillSetup()

  const connectState = checking ? 'in-progress' : connected ? 'done' : 'pending'
  // A pending skill scan must not hide an already-installed skill's controls.
  const skillInstallBlocked = !connected && !skillSetup.skillInstalled && !skillSetup.skillChecking

  return (
    <>
      <ol className="divide-y divide-border/50">
        <TaskSourceStepRow
          index={1}
          state={connectState}
          title={translate(
            'auto.components.settings.TaskSourceLinearSetup.connectTitle',
            'Connect Linear'
          )}
          description={translate(
            'auto.components.settings.TaskSourceLinearSetup.connectBrowsingDescription',
            'Add a Personal API key to browse Linear issues and link them to Workspaces.'
          )}
          action={
            <Button
              type="button"
              size="sm"
              variant={connected ? 'outline' : 'default'}
              onClick={connected ? onOpenIntegrations : () => setDialogOpen(true)}
            >
              {connected
                ? translate(
                    'auto.components.settings.TaskSourceLinearSetup.manageAccess',
                    'Manage keys'
                  )
                : translate(
                    'auto.components.settings.TaskSourceLinearSetup.addAccess',
                    'Add Linear access'
                  )}
            </Button>
          }
        >
          {connected ? (
            <p className="text-[11px] text-muted-foreground">
              {translate(
                'auto.components.settings.TaskSourceLinearSetup.connectedHint',
                'Workspaces and keys are stored for the active runtime. You can add more access any time.'
              )}
            </p>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => void checkLinearConnection(true)}
            >
              {translate(
                'auto.components.settings.TaskSourceLinearSetup.recheck',
                'Re-check connection'
              )}
            </Button>
          )}
        </TaskSourceStepRow>

        <TaskSourceShowInTasksStep
          index={2}
          providerLabel={translate('auto.components.settings.TasksPane.09ae2d7c51', 'Linear')}
          visible={visible}
          canHide={canHide}
          onToggleVisible={onToggleVisible}
          description={translate(
            'auto.components.settings.TaskSourceLinearSetup.showDescription',
            'Include Linear in the Tasks page source picker and sidebar shortcuts.'
          )}
        />
      </ol>
      <section className="space-y-3 border-t border-border/50 py-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">
            {translate(
              'auto.components.settings.TaskSourceLinearSetup.optionalSkillTitle',
              'Optional: Linear agent skill'
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.TaskSourceLinearSetup.optionalSkillDescription',
              'Adds /orca-linear for agents that support skills. Browsing issues and linking Workspaces work without it.'
            )}
          </p>
        </div>
        {skillInstallBlocked ? (
          <p className="text-[11px] text-muted-foreground">
            {translate(
              'auto.components.settings.TaskSourceLinearSetup.skillBlocked',
              'Connect Linear first, then install the skill for agents.'
            )}
          </p>
        ) : (
          <AgentSkillSetupPanel
            variant="inline"
            hideHeader
            title={translate(
              'auto.components.settings.TaskSourceLinearSetup.skillPanelTitle',
              'Linear skill'
            )}
            description={null}
            skillNames={[ORCA_LINEAR_SKILL_NAME]}
            installedSkillNames={[skillSetup.updateSkillName]}
            installed={skillSetup.skillInstalled}
            loading={skillSetup.skillLoading}
            error={skillSetup.error}
            installDisabled={skillSetup.installDisabled}
            onRecheck={skillSetup.refreshSkill}
            freshnessSkillName={skillSetup.freshnessSkillName}
          />
        )}
      </section>

      <LinearApiKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        connectLabel={translate(
          'auto.components.settings.TaskSourceLinearSetup.addAccess',
          'Add Linear access'
        )}
        onConnected={() => {
          void checkLinearConnection(true)
        }}
      />
    </>
  )
}
