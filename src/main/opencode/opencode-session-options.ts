import { z } from 'zod'
import type { AgentSessionOptionsResult } from '../../shared/agent-session-wire'
import type { OpenCodeServerConnection } from './opencode-server-connection-types'

const catalogSchema = z.object({
  all: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      models: z.record(
        z.string(),
        z.object({
          id: z.string(),
          name: z.string(),
          status: z.string().optional(),
          variants: z.record(z.string(), z.unknown()).optional()
        })
      )
    })
  ),
  default: z.record(z.string(), z.string()),
  connected: z.array(z.string())
})
export type OpenCodeModel = { id: string; label: string; providerID: string; modelID: string }

export async function readOpenCodeModels(
  connection: OpenCodeServerConnection
): Promise<OpenCodeModel[]> {
  const catalog = catalogSchema.parse(await connection.request('GET', '/provider'))
  return catalog.all.flatMap((provider) => {
    if (!catalog.connected.includes(provider.id)) {
      return []
    }
    return Object.values(provider.models)
      .filter((model) => model.status !== 'deprecated')
      .map((model) => ({
        id: `${provider.id}/${model.id}`,
        label: `${model.name} (${provider.name})`,
        providerID: provider.id,
        modelID: model.id
      }))
  })
}

export function openCodeOptions(
  models: OpenCodeModel[],
  current: string
): AgentSessionOptionsResult {
  return {
    models: models.map((model) => ({
      id: model.id,
      label: model.label,
      isDefault: model.id === current,
      efforts: []
    })),
    fastModeSupport: {
      supported: false,
      reason: 'OpenCode does not expose Fast mode in this chat.'
    },
    current: { model: current, confirmed: ['model'] }
  }
}

export function selectOpenCodeModel(
  models: OpenCodeModel[],
  requested: string | undefined
): OpenCodeModel {
  const selected = requested ? models.find((model) => model.id === requested) : models[0]
  if (!selected) {
    throw new Error(
      requested
        ? 'The selected OpenCode model is not available.'
        : 'OpenCode has no connected model. Configure a provider with opencode auth login.'
    )
  }
  return selected
}
