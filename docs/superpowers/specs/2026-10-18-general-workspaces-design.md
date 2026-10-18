# General sources and questions in UndoGraph

## Intended result

Judges can enter their own text and questions, generate real answers, correct a source, and independently inspect selective repair. Customer support remains one example; project requirements, research notes, product information, and procedures use the same custom flow.

Reuse the current React UI, Workers AI binding, Cloudflare Workflows, FalkorDB, and authenticated Railway gateway. Add no packages, providers, API keys, or services. Existing provider usage limits still apply.

## User flow

1. Open a live workspace and choose the existing Northstar example or **Create your own workspace**.
2. Enter a workspace name, 1–3 named text sources, and 1–3 questions. Each question explicitly selects the sources supplied to its answering agent. Start with an editable project-document example so the independent branch is easy to demonstrate.
3. Generate source notes and answers with real inference. Show exact source quotations, recorded input versions, agent sessions, and the dependency graph.
4. Edit any custom source's full text and supply a correction reason. Save a new immutable version, identify affected work through the existing impact traversal, and block approval of outdated answers.
5. Repair the affected notes and answers. Show changed answers and evidence even where wording stays the same, preserve independent artifacts' exact IDs/hashes, and retain history and audit export.
6. Reload to recover the workspace. A new scenario uses the existing explicit reset/new-generation flow; it does not overwrite another visitor's data or silently replace an existing workspace.

The UI identifies **Live workspace** and **Recorded demo** clearly. Custom source text is not labeled synthetic or recorded. Northstar's stored example and earlier capture remain compatible.

## Domain and graph contracts

- Preserve the existing retail workflow and its schemas as a backwards-compatible example path.
- Add document source bodies and question case bodies. Sources have stable logical IDs; questions record their selected source logical IDs. Reject duplicate IDs, missing selections, references to absent sources, empty content, and payloads beyond the existing HTTP body limit.
- Custom source text is limited to 2,000 characters per source; questions to 500 characters each; names/titles to existing short-text limits. These caps keep the public demo bounded. No URLs are fetched and no files are parsed.
- Add a source-note artifact kind with its exact source version, a brief AI summary, and exact unique quotations verified against the stored text. Unsupported or insufficient evidence is explicitly flagged for review.
- Reuse reply artifacts for custom answers, adding an `answered` decision alongside existing decisions. Store the question and every source/note actually supplied as dependencies. Answer citations must refer to those supplied versions; model-generated text remains a draft requiring review.
- An analyst creates notes for each source. A writer answers each question from its selected sources and notes. Do not describe the recorded inputs as inferred semantic dependencies: supplying a source creates a dependency even if a later answer does not quote it.
- Reuse the existing bounded impact query, dependency ordering, candidate staging, exact version remapping, revision guards, stale-review refusal, and preservation report.
- Derive complete-build output identities from the current input records instead of assuming six outputs. Validate the entire expected set before guarded publication.
- Persist workspace name/mode and an initialization configuration hash. Retries reopen the same configuration; incompatible initialization attempts are rejected rather than mixing scenarios.
- Keep generic graph operations fixed and parameterized. The gateway and Worker use matching contracts; browser input never becomes Cypher.

## Judge example

Source A says the Atlas launch is on November 12 and Priya approves it. Source B says Sam owns the release checklist. Questions ask for the launch date using A, the approver using A, and the checklist owner using B.

After generating work, change A's launch date to November 19. Its source notes and both A-dependent answers become stale. Repair updates their evidence; the approver may remain Priya. Source B's notes and checklist answer retain their original IDs and hashes.

Use a second, independently entered research/product example in verification to establish that the flow does not depend on Atlas, Northstar, fixed case IDs, or a return-window sentence.

## Verification and delivery

- Unit tests first for custom configuration, source-reference validation, exact quotation/citation validation, missing evidence, and complete expected output sets.
- Real FalkorDB/API/Workflow tests for custom initialization and reopen, two domains, correction/repair, unchanged independent records, stale approval refusal, revision conflicts, and visitor isolation. Retain the old Northstar regression coverage.
- Exercise the maximum supported custom scenario against the existing 50-external-subrequest Workflow budget, including a corrected model response and a repeated save after a lost acknowledgement. If that supported bound cannot pass, reduce the declared input bound before release rather than bypassing guards.
- Browser verification of custom input, source selection, correction, repair, audit export, keyboard/form errors, mobile layout, and clearly separated recorded mode.
- Run the complete relevant suite, type checking, lint, and production builds. Distinguish simulated provider tests from real live inference.
- Update setup/demo documentation and submission wording. Prepare any deployment only after local/CI verification; report exactly which environment was verified.

## Scope boundary

This update accepts pasted text and questions. It does not add document crawling, PDF extraction, arbitrary tools, external actions, a general agent framework, or automatic guarantees that AI interpretations are correct. The evidence and review controls let a judge inspect those interpretations.
