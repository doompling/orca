import { FolderPlus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function LocalProjectsLanding(): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  const hasProjects = useAppStore((s) =>
    s.localProjects.projects.some((project) => !project.isArchived)
  )
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background">
      <div className="max-w-lg space-y-4 px-6 text-center">
        <h1 className="text-xl font-semibold">
          {translate(
            'auto.features.local.projects.LocalProjectsLanding.ac7f5ecdef',
            'Your local Projects'
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {hasProjects
            ? translate(
                'auto.features.local.projects.LocalProjectsLanding.1322c1d9f2',
                'Select a Workspace to return to its files, tabs, and sessions.'
              )
            : translate(
                'auto.features.local.projects.LocalProjectsLanding.32afc3fcf8',
                'Bring related directories together. Keep a separate working context for each task.'
              )}
        </p>
        <Button onClick={() => openModal('add-repo')}>
          <FolderPlus />
          {translate('auto.features.local.projects.LocalProjectsLanding.0b97a9f042', 'New Project')}
        </Button>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.features.local.projects.LocalProjectsLanding.caac2ae5a0',
            'Projects group directories. Workspaces remember how you are working in them.'
          )}
        </p>
      </div>
    </div>
  )
}
