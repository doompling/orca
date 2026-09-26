import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { z } from 'zod'
import type { AgentSessionJournalIdentity } from '../../shared/agent-session-journal-types'
import type { OpenCodeServerConnection } from './opencode-server-connection-types'
import type {
  OpenCodeStructuredLaunch,
  OpenCodePermissionRule
} from './opencode-structured-launch-resolution'
import {
  openCodeRuleSchema,
  openCodeSessionPath,
  openCodeSessionSchema
} from './opencode-session-protocol'
import { readOpenCodeModels, selectOpenCodeModel } from './opencode-session-options'

const configSchema = z.object({
  model: z.string().optional(),
  permission: z.unknown().optional()
})
const agentsSchema = z.array(
  z.object({
    name: z.string(),
    permission: z.array(openCodeRuleSchema),
    model: z.object({ providerID: z.string(), modelID: z.string() }).optional()
  })
)

function configuredDenies(value: unknown): OpenCodePermissionRule[] {
  if (value === 'deny') {
    return [{ permission: '*', pattern: '*', action: 'deny' }]
  }
  const parsed = z.record(z.string(), z.unknown()).safeParse(value)
  if (!parsed.success) {
    return []
  }
  return Object.entries(parsed.data).flatMap(([permission, rules]) => {
    if (rules === 'deny') {
      return [{ permission, pattern: '*', action: 'deny' as const }]
    }
    const entries = z.record(z.string(), z.unknown()).safeParse(rules)
    return entries.success
      ? Object.entries(entries.data)
          .filter(([, action]) => action === 'deny')
          .map(([pattern]) => ({ permission, pattern, action: 'deny' as const }))
      : []
  })
}

export async function openOpenCodeSession(input: {
  connection: OpenCodeServerConnection
  launch: OpenCodeStructuredLaunch
  identity: AgentSessionJournalIdentity
  options?: Readonly<Record<string, string>>
}) {
  const { connection, launch, identity } = input
  const models = await readOpenCodeModels(connection)
  const config = configSchema.parse(await connection.request('GET', '/config'))
  const agent = agentsSchema
    .parse(await connection.request('GET', '/agent'))
    .find((value) => value.name === 'build')
  if (!agent) {
    throw new Error('OpenCode did not report its build agent.')
  }
  const permissions = [
    ...launch.permissionRules,
    ...configuredDenies(config.permission),
    ...agent.permission.filter((rule) => rule.action === 'deny')
  ]
  const scope = createHash('sha256')
    .update(
      JSON.stringify({
        workspaceId: identity.workspaceId,
        cwd: launch.cwd,
        scope: launch.localWorkspaceScope ?? null
      })
    )
    .digest('hex')
  const metadata = { orcaSessionId: identity.sessionId, orcaWorkspaceScope: scope }
  const existing = launch.resumeSessionId
    ? openCodeSessionSchema.parse(
        await connection.request('GET', openCodeSessionPath(launch.resumeSessionId))
      )
    : null
  if (
    existing &&
    (existing.id !== launch.resumeSessionId ||
      existing.metadata?.orcaSessionId !== metadata.orcaSessionId ||
      existing.metadata?.orcaWorkspaceScope !== scope)
  ) {
    throw new Error('OpenCode returned a conversation with a different saved Workspace scope.')
  }
  if (existing && (await realpath(existing.directory)) !== (await realpath(launch.cwd))) {
    throw new Error('OpenCode returned a conversation in a different directory.')
  }
  const requested =
    input.options?.model ??
    (existing?.model
      ? `${existing.model.providerID}/${existing.model.id}`
      : (config.model ??
        (agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : undefined)))
  const model = selectOpenCodeModel(models, requested)
  const currentRules = existing?.permission ?? []
  const policyConfirmed =
    existing !== null && hasOpenCodePermissionSuffix(currentRules, permissions)
  const expectedRules = existing
    ? policyConfirmed
      ? currentRules
      : [...currentRules, ...permissions]
    : permissions
  const session = openCodeSessionSchema.parse(
    existing
      ? policyConfirmed
        ? existing
        : await connection.request('PATCH', openCodeSessionPath(existing.id), {
            permission: permissions
          })
      : await connection.request('POST', '/session', {
          title: 'Ether chat',
          metadata,
          permission: permissions,
          agent: 'build',
          model: { providerID: model.providerID, id: model.modelID }
        })
  )
  if (
    (existing && session.id !== existing.id) ||
    (await realpath(session.directory)) !== (await realpath(launch.cwd)) ||
    session.metadata?.orcaSessionId !== identity.sessionId ||
    session.metadata?.orcaWorkspaceScope !== scope ||
    JSON.stringify(session.permission) !== JSON.stringify(expectedRules)
  ) {
    throw new Error('OpenCode did not confirm the requested conversation scope and permissions.')
  }
  return { sessionId: session.id, models, model }
}

function hasOpenCodePermissionSuffix(
  current: OpenCodePermissionRule[],
  desired: OpenCodePermissionRule[]
): boolean {
  const reset = desired[0]
  return (
    reset?.permission === '*' &&
    reset.pattern === '*' &&
    reset.action === 'ask' &&
    current.length >= desired.length &&
    JSON.stringify(current.slice(-desired.length)) === JSON.stringify(desired)
  )
}
