import { useState } from 'react'
import { basename } from '@/lib/path'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { LocalProjectRoot } from '../../../../shared/local-projects/types'

export function LocalProjectRootFields({
  roots,
  onRootsChange,
  defaultRootId,
  onDefaultChange,
  disabled,
  onError,
  editing = false
}: {
  roots: LocalProjectRoot[]
  onRootsChange: (roots: LocalProjectRoot[]) => void
  defaultRootId: string
  onDefaultChange: (id: string) => void
  disabled: boolean
  onError: (message: string) => void
  editing?: boolean
}): React.JSX.Element {
  const [directory, setDirectory] = useState('')
  const addDirectories = (paths: string[]) => {
    const additions = paths.map((path) => ({
      id: crypto.randomUUID(),
      label: basename(path),
      path
    }))
    onRootsChange([...roots, ...additions])
    if (!editing && !defaultRootId && additions[0]) {
      onDefaultChange(additions[0].id)
    }
    setDirectory('')
  }
  const browse = async () => {
    try {
      addDirectories(await window.api.repos.pickFolders())
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const move = (index: number, delta: number) => {
    const next = [...roots]
    const [root] = next.splice(index, 1)
    if (root) {
      next.splice(index + delta, 0, root)
      onRootsChange(next)
    }
  }
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="local-project-directory">Directory path</Label>
        <Input
          id="local-project-directory"
          value={directory}
          onChange={(event) => setDirectory(event.target.value)}
          disabled={disabled}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || !directory.trim() || roots.length >= 64}
            onClick={() => addDirectories([directory.trim()])}
          >
            Add directory
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || roots.length >= 64}
            onClick={() => void browse()}
          >
            Browse folders
          </Button>
        </div>
      </div>
      <ul
        className="max-h-64 space-y-3 overflow-auto scrollbar-sleek"
        aria-label="Project directories"
      >
        {roots.map((root, index) => (
          <li key={root.id} className="space-y-2">
            {editing ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor={`local-root-label-${root.id}`}>Directory label {index + 1}</Label>
                  <Input
                    id={`local-root-label-${root.id}`}
                    value={root.label}
                    disabled={disabled}
                    onChange={(event) =>
                      onRootsChange(
                        roots.map((entry) =>
                          entry.id === root.id ? { ...entry, label: event.target.value } : entry
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`local-root-path-${root.id}`}>
                    {root.label || 'Directory'} path
                  </Label>
                  <Input
                    id={`local-root-path-${root.id}`}
                    value={root.path}
                    disabled={disabled}
                    onChange={(event) =>
                      onRootsChange(
                        roots.map((entry) =>
                          entry.id === root.id ? { ...entry, path: event.target.value } : entry
                        )
                      )
                    }
                  />
                </div>
              </>
            ) : (
              <div className="min-w-0">
                <p className="truncate text-sm">{root.label}</p>
                <p className="truncate font-mono text-xs text-muted-foreground" title={root.path}>
                  {root.path}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              {editing && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled || index === 0}
                    aria-label={`Move ${root.label} up`}
                    onClick={() => move(index, -1)}
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled || index === roots.length - 1}
                    aria-label={`Move ${root.label} down`}
                    onClick={() => move(index, 1)}
                  >
                    Down
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={`Remove ${root.label}`}
                onClick={() => {
                  onRootsChange(roots.filter((entry) => entry.id !== root.id))
                  if (defaultRootId === root.id) {
                    onDefaultChange('')
                  }
                }}
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {roots.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="local-project-default-root">Default command directory</Label>
          <Select value={defaultRootId} onValueChange={onDefaultChange} disabled={disabled}>
            <SelectTrigger id="local-project-default-root">
              <SelectValue placeholder="Choose a directory" />
            </SelectTrigger>
            <SelectContent>
              {roots.map((root) => (
                <SelectItem key={root.id} value={root.id}>
                  {root.label || root.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Agents receive every directory, regardless of this default.
          </p>
        </div>
      )}
    </>
  )
}
