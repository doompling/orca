import { z } from 'zod'

export const openCodeRuleSchema = z.object({
  permission: z.string(),
  pattern: z.string(),
  action: z.enum(['allow', 'ask', 'deny'])
})
export const openCodeSessionSchema = z.object({
  id: z.string().startsWith('ses'),
  directory: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  permission: z.array(openCodeRuleSchema).optional(),
  model: z.object({ providerID: z.string(), id: z.string() }).optional()
})
export const openCodeMessageSchema = z.object({
  id: z.string().startsWith('msg'),
  sessionID: z.string(),
  role: z.enum(['user', 'assistant']),
  parentID: z.string().optional(),
  time: z.object({ created: z.number(), completed: z.number().optional() }),
  error: z.unknown().optional(),
  finish: z.string().optional()
})
export const openCodePartSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  type: z.string(),
  text: z.string().optional(),
  tool: z.string().optional(),
  callID: z.string().optional(),
  state: z
    .object({
      status: z.enum(['pending', 'running', 'completed', 'error']),
      input: z.unknown().optional(),
      output: z.string().optional(),
      error: z.string().optional()
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})
export const openCodeHistorySchema = z
  .array(
    z.object({
      info: openCodeMessageSchema,
      parts: z.array(openCodePartSchema)
    })
  )
  .max(500)
export const openCodeEventSchema = z.object({
  type: z.string(),
  properties: z.record(z.string(), z.unknown())
})
export const openCodeQuestionSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  questions: z
    .array(
      z.object({
        question: z.string(),
        header: z.string(),
        options: z.array(z.object({ label: z.string(), description: z.string() })),
        multiple: z.boolean().optional(),
        custom: z.boolean().optional()
      })
    )
    .min(1)
    .max(50)
})
export const openCodePermissionSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  permission: z.string().optional(),
  action: z.string().optional(),
  patterns: z.array(z.string()).optional(),
  resources: z.array(z.string()).optional()
})
export type OpenCodeMessage = z.infer<typeof openCodeMessageSchema>
export type OpenCodePart = z.infer<typeof openCodePartSchema>
export type OpenCodeHistory = z.infer<typeof openCodeHistorySchema>
export type OpenCodeQuestion = z.infer<typeof openCodeQuestionSchema>

export function openCodeSessionPath(sessionId: string): string {
  return `/session/${encodeURIComponent(sessionId)}`
}
