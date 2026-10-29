import React, { useCallback, useId, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'

type ProjectGroupNameDialogProps = {
  open: boolean
  title: string
  description: string
  initialName: string
  confirmLabel: string
  // Ether seam: local-projects — local Project rename reuses this dialog with its own label and errors.
  nameLabel?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => Promise<void> | void
}

export function ProjectGroupNameDialog({
  open,
  title,
  description,
  initialName,
  confirmLabel,
  nameLabel,
  onOpenChange,
  onSubmit
}: ProjectGroupNameDialogProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [previousOpenState, setPreviousOpenState] = useState({ open, initialName })
  const mountedRef = useRef(true)
  const trimmedName = name.trim()

  const handleDialogContentRef = useCallback((node: HTMLDivElement | null): void => {
    // Track content attachment so late saves cannot update closed dialog state.
    mountedRef.current = node !== null
  }, [])

  // Seed before paint so selection sees the current name instead of the prior draft.
  if (open !== previousOpenState.open || initialName !== previousOpenState.initialName) {
    setPreviousOpenState({ open, initialName })
    if (open) {
      setName(initialName)
      setSubmitting(false)
      setErrorMessage(null)
    }
  }

  const handleSubmit = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault()
      if (!trimmedName || submitting) {
        return
      }
      setSubmitting(true)
      setErrorMessage(null)
      try {
        await onSubmit(trimmedName)
        if (mountedRef.current) {
          onOpenChange(false)
        }
      } catch (error) {
        console.error('Failed to save project group name:', error)
        if (mountedRef.current) {
          setSubmitting(false)
          setErrorMessage(error instanceof Error ? error.message : String(error))
        }
      }
    },
    [onOpenChange, onSubmit, submitting, trimmedName]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={handleDialogContentRef}
        className="max-w-sm sm:max-w-sm"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.select()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label htmlFor={inputId} className="text-[11px] text-muted-foreground">
              {nameLabel ??
                translate(
                  'auto.components.sidebar.ProjectGroupNameDialog.83dfbc5313',
                  'Group Name'
                )}
            </Label>
            <Input
              id={inputId}
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-8 text-xs"
            />
          </div>
          {/* Ether seam: local-projects */}
          {errorMessage && (
            <p role="alert" className="text-xs text-destructive">
              {errorMessage}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => onOpenChange(false)}
            >
              {translate('auto.components.sidebar.ProjectGroupNameDialog.d99a034073', 'Cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs"
              disabled={!trimmedName || submitting}
            >
              {submitting
                ? translate(
                    'auto.components.sidebar.ProjectGroupNameDialog.4a64e78822',
                    'Saving...'
                  )
                : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
