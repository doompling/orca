import { translate } from '@/i18n/i18n'
/** Names the Workspace roots a multi-root search could not read; renders nothing otherwise. */
export function LocalWorkspaceSearchIncompleteBanner({
  errors
}: {
  errors: readonly string[] | undefined
}): React.JSX.Element | null {
  if (!errors?.length) {
    return null
  }
  return (
    <div role="status" className="px-2 py-1 text-xs text-destructive border-b border-border">
      <p>
        {translate(
          'auto.features.local.projects.seams.LocalWorkspaceSearchIncompleteBanner.ea75e36f02',
          'Search incomplete'
        )}
      </p>
      {errors.map((error, index) => (
        <p key={`${index}:${error}`}>{error}</p>
      ))}
    </div>
  )
}
