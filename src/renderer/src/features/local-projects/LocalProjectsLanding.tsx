import { FolderPlus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'

export function LocalProjectsLanding(): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  const hasProjects = useAppStore((s) =>
    s.localProjects.projects.some((project) => !project.isArchived)
  )
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background">
      <div className="max-w-lg space-y-4 px-6 text-center">
        <h1 className="text-xl font-semibold">Your local Projects</h1>
        <p className="text-sm text-muted-foreground">
          {hasProjects
            ? 'Select a Workspace to return to its files, tabs, and sessions.'
            : 'Bring related directories together. Keep a separate working context for each task.'}
        </p>
        <Button onClick={() => openModal('add-repo')}>
          <FolderPlus />
          New Project
        </Button>
        <p className="text-xs text-muted-foreground">
          Projects group directories. Workspaces remember how you are working in them.
        </p>
      </div>
    </div>
  )
}
