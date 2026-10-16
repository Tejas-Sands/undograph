import type { RecordedStage } from './useWorkspace'

export const simulationSteps: { title: string; stage: RecordedStage; text: string }[] = [
  { title: 'Two sessions, shared memory', stage: 'original', text: 'The policy agent extracted a 30-day return window. A separate support session used those facts to assess 7-day and 21-day cases. Both were eligible; an account-help reply has independent inputs.' },
  { title: 'Correct the source: 30 → 14 days', stage: 'corrected', text: 'The source correction creates a new immutable version. Graph traversal marks exactly five dependent outputs stale: policy facts, two assessments and two replies. The independent reply stays current.' },
  { title: 'Stale work is blocked from review', stage: 'corrected', text: 'The 21-day reply still contains its old decision. Its stale status blocks review until repair; the original evidence remains inspectable. This disabled control illustrates the live server’s review gate.' },
  { title: 'Repair only affected work', stage: 'repaired', text: 'The captured repair rebuilt five affected versions against the 14-day policy. The 7-day case remains eligible; the 21-day case becomes ineligible. New repair sessions retain the earlier sessions and evidence.' },
  { title: 'Verify what stayed unchanged', stage: 'repaired', text: 'The independent account-help reply keeps its exact version ID and SHA-256. Inspect the graph and previous versions below, then export the labeled simulation audit to review the full lineage.' },
]
