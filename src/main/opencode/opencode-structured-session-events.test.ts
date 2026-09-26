import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import { encodeAgentSessionQuestionAnswers } from '../../shared/agent-session-question-answer'
import { openCodeAdapterFixture, openCodeText, openCodeUser } from './opencode-adapter-test-fixture'

const fixtures: Awaited<ReturnType<typeof openCodeAdapterFixture>>[] = []
async function fixture() {
  const value = await openCodeAdapterFixture()
  fixtures.push(value)
  await value.acquire()
  return value
}
afterEach(async () => {
  for (const value of fixtures.splice(0)) {
    await value.cleanup()
  }
})
function promptItem(kind: 'approval' | 'question', id: string) {
  return agentJournalItemKey({
    provider: 'opencode',
    sessionId: 'ses_fixture',
    messageId: `orca-${kind}:${id}`
  })
}

describe('OpenCode journal and live prompts', () => {
  it('streams text, reasoning and tools with stable separate identities', async () => {
    const f = await fixture()
    f.emit('message.updated', { info: openCodeUser() })
    f.emit('message.part.updated', { part: openCodeText() })
    f.emit('message.updated', {
      info: {
        id: 'msg_reply',
        sessionID: 'ses_fixture',
        role: 'assistant',
        parentID: 'msg_user',
        time: { created: 101 }
      }
    })
    f.emit('message.part.updated', {
      part: { ...openCodeText('msg_reply', 'Hel'), id: 'prt_reply' }
    })
    f.emit('message.part.delta', {
      messageID: 'msg_reply',
      partID: 'prt_reply',
      field: 'text',
      delta: 'lo'
    })
    f.emit('message.part.updated', {
      part: { ...openCodeText('msg_reply', 'Thinking'), id: 'prt_reason', type: 'reasoning' }
    })
    f.emit('message.part.updated', {
      part: {
        id: 'prt_tool',
        sessionID: 'ses_fixture',
        messageID: 'msg_reply',
        type: 'tool',
        tool: 'read',
        callID: 'call_read',
        state: { status: 'completed', input: { path: 'file.txt' }, output: 'contents' }
      }
    })
    expect(f.rows).toContainEqual({
      identity: { provider: 'opencode', sessionId: 'ses_fixture', messageId: 'msg_reply' },
      body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Hello' }] }
    })
    expect(f.rows).toContainEqual(
      expect.objectContaining({
        identity: expect.objectContaining({ partId: 'prt_reason' }),
        body: expect.objectContaining({ role: 'reasoning' })
      })
    )
    expect(f.rows).toContainEqual(
      expect.objectContaining({
        identity: expect.objectContaining({ partId: 'prt_tool' }),
        body: expect.objectContaining({
          kind: 'tool-call',
          name: 'read',
          state: 'completed',
          output: expect.objectContaining({ head: 'contents' })
        })
      })
    )
    const turn = f.rows.find((row) => row.body.kind === 'turn')
    expect(turn?.identity).toMatchObject({ messageId: 'orca-turn:msg_user' })
    expect(f.sink.publish).toHaveBeenCalled()
  })
  it('ignores other sessions and does not infer success from idle alone', async () => {
    const f = await fixture()
    f.emit('message.updated', {
      sessionID: 'ses_other',
      info: { ...openCodeUser(), sessionID: 'ses_other' }
    })
    expect(f.rows).toHaveLength(0)
    f.emit('message.updated', { info: openCodeUser() })
    f.emit('session.status', { status: { type: 'idle' } })
    expect(f.rows.at(-1)?.body).toMatchObject({ kind: 'turn', state: 'unverifiable' })
    expect(f.rows.at(-1)?.body).not.toHaveProperty('outcome')
  })
  it.each([false, true])('claims approval before committing; v2=%s', async (v2) => {
    const f = await fixture()
    f.emit(v2 ? 'permission.v2.asked' : 'permission.asked', {
      id: 'per_one',
      permission: 'bash',
      action: 'bash',
      patterns: ['ls'],
      resources: ['ls']
    })
    const itemId = promptItem('approval', 'per_one')
    const commit = vi.fn(async () => {
      expect(f.request.mock.calls.some(([, path]) => path.endsWith('/reply'))).toBe(false)
    })
    await f.adapter.answerPrompt({
      sessionId: 'orca-session',
      fence: 1,
      kind: 'approval',
      itemId,
      optionId: 'once',
      commit
    })
    expect(commit).toHaveBeenCalledOnce()
    expect(f.request).toHaveBeenCalledWith(
      'POST',
      v2 ? '/api/session/ses_fixture/permission/per_one/reply' : '/permission/per_one/reply',
      { reply: 'once' }
    )
    await expect(
      f.adapter.answerPrompt({
        sessionId: 'orca-session',
        fence: 1,
        kind: 'approval',
        itemId,
        optionId: 'once',
        commit
      })
    ).rejects.toThrow('no longer waiting')
  })
  it('keeps a lost committed approval reply claimed and blocks competing cancellation', async () => {
    const f = await fixture()
    f.emit('message.updated', { info: openCodeUser() })
    f.emit('permission.asked', { id: 'per_one', permission: 'bash', patterns: ['pwd'] })
    f.route(async (method, path, body) => {
      if (path.endsWith('/reply')) {
        throw new Error('lost reply')
      }
      return f.defaultRequest(method, path, body)
    })
    const input = {
      sessionId: 'orca-session',
      fence: 1,
      kind: 'approval' as const,
      itemId: promptItem('approval', 'per_one'),
      optionId: 'once',
      commit: vi.fn(async () => {})
    }
    await expect(f.adapter.answerPrompt(input)).rejects.toThrow('lost reply')
    f.emit('permission.asked', { id: 'per_one', permission: 'bash', patterns: ['pwd'] })
    expect(
      await f.adapter.cancelTurn({ sessionId: 'orca-session', fence: 1, turnId: 'msg_user' })
    ).toEqual({ cancelled: false })
    await expect(f.adapter.answerPrompt(input)).rejects.toThrow('no longer waiting')
    expect(input.commit).toHaveBeenCalledOnce()
  })
  it('preserves completed provider outcomes when closed before the idle notification', async () => {
    const f = await fixture()
    f.emit('message.updated', { info: openCodeUser() })
    f.emit('message.updated', {
      info: {
        id: 'msg_reply',
        sessionID: 'ses_fixture',
        role: 'assistant',
        parentID: 'msg_user',
        time: { created: 101, completed: 102 },
        finish: 'stop'
      }
    })
    await f.adapter.closeSession?.('orca-session')
    expect(f.rows.findLast((row) => row.body.kind === 'turn')?.body).toMatchObject({
      state: 'completed',
      outcome: 'success'
    })
  })
  it('routes grouped question labels and custom text without accepting unknown choices', async () => {
    const f = await fixture()
    f.emit('question.asked', {
      id: 'que_one',
      questions: [
        {
          header: 'Pick',
          question: 'Choose one',
          options: [{ label: 'A', description: 'First' }],
          custom: true
        }
      ]
    })
    const input = {
      sessionId: 'orca-session',
      fence: 1,
      kind: 'question' as const,
      itemId: promptItem('question', 'que_one'),
      commit: vi.fn(async () => {})
    }
    await expect(
      f.adapter.answerPrompt({
        ...input,
        optionId: encodeAgentSessionQuestionAnswers([{ questionId: 'que_one:0', optionIds: ['9'] }])
      })
    ).rejects.toThrow('offered choices')
    expect(input.commit).not.toHaveBeenCalled()
    await f.adapter.answerPrompt({
      ...input,
      optionId: encodeAgentSessionQuestionAnswers([
        { questionId: 'que_one:0', optionIds: [], other: 'My answer' }
      ])
    })
    expect(f.request).toHaveBeenCalledWith('POST', '/question/que_one/reply', {
      answers: [['My answer']]
    })
  })
  it('aborts only the exact active turn and allows model changes only when idle', async () => {
    const f = await fixture()
    f.emit('message.updated', { info: openCodeUser() })
    await expect(
      f.adapter.setOption({
        sessionId: 'orca-session',
        fence: 1,
        key: 'model',
        value: 'test/other'
      })
    ).rejects.toThrow('Wait')
    expect(
      await f.adapter.cancelTurn({ sessionId: 'orca-session', fence: 1, turnId: 'wrong' })
    ).toEqual({ cancelled: false })
    expect(
      await f.adapter.cancelTurn({ sessionId: 'orca-session', fence: 1, turnId: 'msg_user' })
    ).toEqual({ cancelled: true })
    expect(f.rows.at(-1)?.body).toMatchObject({ state: 'interrupted', outcome: 'cancellation' })
    expect(
      await f.adapter.setOption({
        sessionId: 'orca-session',
        fence: 1,
        key: 'model',
        value: 'test/other'
      })
    ).toEqual({ model: 'test/other' })
    await expect(
      f.adapter.setOption({ sessionId: 'orca-session', fence: 1, key: 'effort', value: 'low' })
    ).rejects.toThrow('model selection only')
  })
})
