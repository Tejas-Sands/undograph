# General workspaces implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and one independent review at the end.

**Goal:** Let judges enter their own sources/questions, correct arbitrary source text, and verify real graph-backed selective repair.
**Architecture:** Add a backwards-compatible document/question path to the existing artifact, Workflow, and UI contracts. Reuse the current provider, graph, guarded publication, and isolation.
**Tech stack:** Existing React/TypeScript, Zod, Workers AI/Workflows, FalkorDB and gateway. No new dependencies.
**Spec:** ../specs/2026-10-18-general-workspaces-design.md

## Global constraints

- 1–3 sources, 2,000 characters each; 1–3 questions, 500 characters each; explicit source selections.
- Preserve existing Northstar API/recording behavior, quotas, exact input tracking, revision guards and independent ID/hash preservation.
- Use named, parameterized graph queries. Reuse current services; do not introduce another SDK.

## Review focus

- Invalid/duplicate/missing source selections must fail before initialization.
- A retried initialization cannot mix different configurations.
- Quotes/citations must match exact supplied versions; absent evidence requires review.
- Completeness must check expected output identities, not just an output count.
- Source corrections must preserve unrelated records and reject stale review/publication.

## Task 1: Contracts, grounded inference, and graph execution

Files: shared/contracts.ts; shared/knowledge.ts (configuration/examples/expected output identities); worker/knowledge.ts (evidence validation); worker/agents.ts; worker/domain.ts; worker/graph/{store,queries}.ts; worker/{index,runs,repair,workflows}.ts; tests/{knowledge,agents,api,workflows}.test.ts; tests/helpers/synthetic-ai.ts.

- [x] Add failing unit cases: independent source IDs; empty/foreign/duplicate references; changed versus unchanged source; exact quotations; rejected foreign citations; expected identities for 2 sources/3 questions = 5 distinct outputs.
- [x] Run focused unit tests and confirm failures are missing behavior.
- [x] Add document/question/source-note contracts and grounded generation. Persist initialization identity and workspace name. Support full-text correction through existing guarded mutation.
- [x] Add custom build/repair stages and complete expected-set validation; retain the old retail branch.
- [x] Add real graph/API/Workflow tests for two domains, retries, preservation, stale review, and the maximum supported request budget.
- [x] Run unit, graph, API and Workflow checks; report environment limitations explicitly.

## Task 2: Custom input and evidence UI

Files: src/components/{ScenarioForm,SourcePanel,AppShell,WorkPanels,ArtifactInspector,LineageGraph}.tsx; src/{App,useWorkspace,presentation,Root}.tsx/ts; src/index.css; shared/knowledge.ts; tests/e2e/general-workspace.spec.ts.

- [x] Add a failing browser flow: enter project sources/questions, choose explicit source scope, create workspace, reload, edit source, inspect affected outputs and preserved branch. Add validation/mobile checks.
- [x] Implement an accessible inline setup form using existing controls/styles, with editable project/research examples and custom mode as the default live entry.
- [x] Adapt labels, source editing, notes, citations, graph default selection and new-workspace confirmation. Keep the retail example available.
- [x] Verify browser input, errors, mode separation and responsive layout.

## Task 3: Verification, review, documentation, commit and push

- [x] Run npm test, typecheck, lint, browser tests, client and gateway builds; use CI for checks unavailable in the local sandbox.
- [x] Request one independent review and resolve concrete findings.
- [x] Update README, graph/demo docs and evidence, distinguishing test-provider coverage from live inference.
- [x] Commit and push using the verified existing Tejas-Sands author/committer identity, as explicitly requested. Report the resulting commit and actual deployment status.

## Execution ledger

- Ruling: The user approved the linked written design and explicitly requested implementation, commit and push. Execute inline without another authorization question; use the existing selected checkout and Git identity.
- Baseline: clean implementation checkout on main; 43 unit tests passed before product changes. The only pending file is the approved design.
- Identity: Tejas-Sands <122252636+Tejas-Sands@users.noreply.github.com> for author and committer.

- Implemented contracts, configuration identity, grounded source notes/answers, full-text correction, derived completeness sets and graph-driven repair. Added project/research examples and custom UI; retained legacy retail APIs and recorded evidence. No new dependencies.
- Test-first evidence: new configuration/evidence tests failed before implementation; new inference-accounting tests failed against the original three-request path. Unit suite now passes 60 tests.
- Local verification: typecheck, lint, client/Worker build and gateway build passed. `npm test` passes unit tests then cannot start workerd: `listen EPERM 127.0.0.1`. Graph and browser test startup share the socket restriction; Docker access is also unavailable. The existing GitHub CI runner will execute those checks with a real disposable FalkorDB.
- Budget adjustment: batch quota reservation and attempt logging in the existing authenticated gateway as `logAttempt`; validate workspace/control prefixes and preserve every attempt's quota. Deploy gateway before Worker.
- Independent read-only review requested; documentation updated for custom input, dependency semantics, evidence limits and coordinated deployment. Public custom inference has not been deployed or verified in this change.

- Independent review completed: fixed concurrent same-configuration recovery, exposed exact cited source versions separately from inputs, expanded maximum budget coverage to all six outputs, and added the opt-in complete custom live browser flow. No outstanding code findings; merge is conditional on CI. Real provider output quality remains outside offline CI.

- Final CI: [run 39104290430](https://github.com/Tejas-Sands/undograph/actions/runs/39104290430) passed on implementation commit `70d722e`: typecheck, lint, all unit/Worker/native graph tests, authenticated gateway and gateway Workflow suites, 29 browser cases, client/Worker/gateway builds, Docker image and all three Railway password/lifecycle checks. The two real-inference browser cases are explicitly skipped in offline CI.
- CI initially found duplicate server-error announcements in the custom form and an incorrect recorded reply selector. Fixed both, added the generic empty-workspace name and reran the complete job successfully. Desktop/mobile custom-workspace screenshots were inspected.
- Delivery: implementation commits `8041530` and `70d722e` use the verified Tejas-Sands author and committer identity and are pushed. Fast-forward the original main branch to the verified implementation plus this evidence-only update, then push main; the fetched remote main still equals the original base. No force push or new service is needed.
- Deployment status at the implementation milestone: public preview still used the earlier retail implementation. The subsequent user-authorized deployment is recorded below.

- Public deployment completed October 18: the operator updated Railway; custom initialization passed before Worker activation. Active Worker version `2b3b2903-a38b-4769-8f28-dad35e315830` and both refreshed Workflow definitions use runtime fix `57005a1`. No services, packages or credentials were added.
- Live-inference fix: provider returned a correct research answer with `reviewRequired: false`. New regressions failed first; the custom adapter now sets the mandatory review policy on the server, validates citations unchanged and persists through the strict artifact schema. All 63 unit cases and [complete runtime CI](https://github.com/Tejas-Sands/undograph/actions/runs/39107536993) pass. Independent review found no issues.
- Final public verification: [run 39108021219](https://github.com/Tejas-Sands/undograph/actions/runs/39108021219) passed both project/research browser correction/repair scenarios with real Workers AI, exact quotations/citations, stale-review refusal and complete independent-record preservation. The original retail API smoke passed and test-owned terminal workspaces were deleted. Repaired screenshots were inspected. Test-only commit `03ebfaf` explicitly selects the source's graph tab before inspecting notes; it changes no runtime code.
