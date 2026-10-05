import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LinearAgentSkillGuide, type LinearSetupReadiness } from './LinearAgentSkillGuide'

const baseReadiness: LinearSetupReadiness = {
  connected: true,
  checking: false,
  skillInstalled: false,
  skillChecking: false,
  skillUnverifiable: false,
  visible: true
}

function renderGuide(readiness: Partial<LinearSetupReadiness>): string {
  return renderToStaticMarkup(
    <LinearAgentSkillGuide
      readiness={{ ...baseReadiness, ...readiness }}
      onOpenTaskSources={vi.fn()}
      onManageLinearAccess={vi.fn()}
      skillPanel={<div data-testid="skill-panel">Skill install panel</div>}
    />
  )
}

describe('LinearAgentSkillGuide', () => {
  it('renders two browsing requirements followed by optional agent tooling', () => {
    const markup = renderGuide({})

    expect(markup).toContain('Setup checklist')
    expect(markup).toContain('>Ready<')
    expect(markup).toContain('2. Show Linear in Tasks')
    expect(markup).toContain('Optional: Linear agent skill')
    expect(markup).toContain('Browsing issues and linking Workspaces work without it.')
    expect(markup).toContain('Task Sources')
    expect(markup).toContain('Skill install panel')
    expect(markup).not.toContain('Ready below')
    expect(markup).not.toContain('Install below')
    expect(markup).not.toContain('Agent skill')
    expect(markup).not.toContain('Open Task Sources setup')
  })

  it('does not change browsing readiness when the skill is installed', () => {
    expect(renderGuide({ skillInstalled: true })).toContain('>Ready<')
  })

  it('keeps durable progress while a skill recheck is in flight', () => {
    const markup = renderGuide({ skillInstalled: true, skillChecking: true })

    expect(markup).toContain('>Ready<')
    expect(markup).not.toContain('Checking…')
  })

  it('keeps durable progress while a connection check is in flight', () => {
    const markup = renderGuide({ skillInstalled: true, checking: true })

    expect(markup).toContain('Checking…')
    expect(markup).not.toContain('>Ready<')
  })

  it('keeps browsing ready when the optional skill cannot be verified', () => {
    const markup = renderGuide({ skillUnverifiable: true })

    expect(markup).toContain('>Ready<')
    expect(markup).not.toContain('Cannot verify')
    expect(markup).not.toContain('2/3')
    expect(markup).not.toContain('bg-amber-500')
  })

  it('keeps browsing ready while a rescan of the optional skill runs', () => {
    const markup = renderGuide({ skillUnverifiable: true, skillChecking: true })

    expect(markup).toContain('>Ready<')
    expect(markup).not.toContain('Checking…')
    expect(markup).not.toContain('Cannot verify')
  })

  it('lets a found skill outrank a stale unverifiable flag', () => {
    const markup = renderGuide({ skillInstalled: true, skillUnverifiable: true })

    expect(markup).toContain('>Ready<')
    expect(markup).not.toContain('Cannot verify')
  })

  it('keeps the confirmed count when the unfinished step is the connection', () => {
    const markup = renderGuide({ connected: false, skillUnverifiable: true })

    expect(markup).toContain('1 of 2 ready')
    expect(markup).not.toContain('Cannot verify')
  })

  it('does not headline an unknown skill over an unfinished visibility step', () => {
    const markup = renderGuide({ visible: false, skillUnverifiable: true })

    expect(markup).toContain('1 of 2 ready')
    expect(markup).not.toContain('Cannot verify')
    // Hiding Linear is deliberate, so the shared table keeps this pill neutral.
    expect(markup).not.toContain('bg-amber-500')
  })
})
