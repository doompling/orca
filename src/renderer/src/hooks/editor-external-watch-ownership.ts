import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'
import {
  getEditorExternalWatchTargetKey,
  type EditorExternalWatchTarget
} from './editor-external-watch-targets'

export function editorWatchSubscriptionKey(target: EditorExternalWatchTarget): string {
  if (target.connectionId || target.runtimeEnvironmentId) {
    return getEditorExternalWatchTargetKey(target)
  }
  return JSON.stringify([
    normalizeRuntimePathForComparison(target.worktreePath),
    target.connectionId ?? null,
    target.runtimeEnvironmentId
  ])
}

export function uniqueEditorWatchSubscriptions(
  targets: readonly EditorExternalWatchTarget[]
): EditorExternalWatchTarget[] {
  return [
    ...new Map(targets.map((target) => [editorWatchSubscriptionKey(target), target])).values()
  ]
}

export function findEditorWatchOwners(
  targets: readonly EditorExternalWatchTarget[],
  worktreePath: string,
  runtimeEnvironmentId: string | null
): EditorExternalWatchTarget[] {
  const path = normalizeRuntimePathForComparison(worktreePath)
  const matching = targets.filter(
    (target) =>
      normalizeRuntimePathForComparison(target.worktreePath) === path &&
      target.runtimeEnvironmentId === runtimeEnvironmentId
  )
  // Legacy desktop events carry no SSH owner; never broaden their existing route across hosts.
  const connectionId = matching[0]?.connectionId
  return matching.filter((target) => target.connectionId === connectionId)
}
