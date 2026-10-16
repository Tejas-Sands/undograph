# Three-minute demo guide

Primary track: Agent Memory and Coordination. The secondary connected-data claim is demonstrated by graph-selected repair and guarded publication. The demo uses fictional Northstar Goods support cases; internal review controls send no external messages.

Start the local app with live Workers AI available and use a fresh visitor workspace. Keep the console at 1440 pixels for recording. If using the recorded example instead, leave its recorded/read-only banner visible and identify it as a frozen walkthrough; never describe those actions as new inference.

For a failure during judging, choose **Simulation** at the bottom left or **Continue in simulation** on the error. The five guided steps demonstrate shared sessions, source correction, stale-review blocking, selective repair and exact preservation. The persistent banner identifies recorded synthetic data. Export the simulation audit, which also labels its origin. The fallback requires the initial website assets to have loaded; it then runs without network/API access. It does not replay the failed live action.

| Time | Action | Explain |
| --- | --- | --- |
| 0:00–0:25 | Start a live workspace and build agent work | Two persisted roles read exact source/case versions. Eligibility is application code; the model interprets evidence and drafts replies. |
| 0:25–0:50 | Inspect the two sessions, an original reply and its inputs; reload | The graph owns durable work and lineage. Supplied input dependencies are recorded, not inferred after the fact. |
| 0:50–1:20 | Correct the return window from 30 to 14 days with a reason | A guarded graph mutation versions the source and invalidates exactly five pending outputs. An unrelated account reply remains current. |
| 1:20–1:45 | Inspect the graph and stale reply | Show the source → facts → assessment → reply path and the blocked review control. Released history would be flagged for review rather than replayed externally. |
| 1:45–2:20 | Repair affected work | The graph orders the replacement set. Candidates publish together only if the revision still matches. The 21-day case becomes ineligible; the 7-day case stays eligible. |
| 2:20–2:45 | Open the repair report and independent reply | Show the unchanged account-reply ID and full content hash, alongside new versions for dependent work. |
| 2:45–3:00 | Export the audit and show observed measurements | Use actual calls, token availability and duration. Selective repair may be slower on a small fixture. End with local/cloud limitations and the public source repository. |

Before submission, the participant should be able to explain `DEPENDS_ON` direction, native uniqueness/current-version pointers, the bounded impact query, corruption/incomplete-audit handling, exact input remapping and final revision guards in `docs/GRAPH.md`. Preparation documents and implementation commits are separate. Asset origins/licenses are in `ASSETS.md`; observed verification is in `VERIFICATION.md`.

AI assistance was used for implementation, tests, debugging and documentation. Commit author and committer identity is Tejas-Sands as requested. Live application inference uses the configured Workers AI model; recorded examples are explicitly identified.

The selected [Railway gateway and Cloudflare deployment](RAILWAY.md) is available at the [public preview](https://undograph-preview.the-workflow-worker.workers.dev). Its complete live build/correction/repair smoke and browser network-failure recovery passed on October 17, 2026 (IST); see [observed verification](VERIFICATION.md). The [guided simulation](https://undograph-preview.the-workflow-worker.workers.dev/#/simulation/overview) is also public. Recording the final demo and submitting the event remain operator steps; neither has been completed by this deployment.
