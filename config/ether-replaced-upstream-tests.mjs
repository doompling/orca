// Upstream tests whose subject Ether changes on purpose. Each has a fork-owned replacement that
// asserts the Ether behaviour; the upstream file stays byte-identical so merges never touch it.
export const ETHER_REPLACED_UPSTREAM_TESTS = [
  // Replaced by src/renderer/src/features/linear-optional-skill/LinearAgentSkillPane.ether.test.tsx
  'src/renderer/src/components/settings/LinearAgentSkillPane.test.tsx',
  // Replaced by src/renderer/src/features/linear-optional-skill/TasksPane.ether.test.tsx
  'src/renderer/src/components/settings/TasksPane.test.tsx',
  // Replaced by src/shared/local-projects/task-providers.ether.test.ts
  'src/shared/task-providers.test.ts'
]
