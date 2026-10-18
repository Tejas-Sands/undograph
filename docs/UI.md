# Operations workspace

Run the app locally and open `http://127.0.0.1:5173`. The root page introduces the product; choose **Open workspace** or go directly to `/#/overview`. The live entry form accepts a workspace name, 1–3 document sources and 1–3 questions with explicit source selection. Choose editable project/research examples or start blank. Creating a workspace stores only the supplied roots; **Start live workspace** remains available for the synthetic Northstar retail example. **Build agent work** launches the actual durable build; counters change only when server snapshots contain persisted records. Active runs poll every two seconds, pause requests while the document is hidden and refresh on focus. Reload recovers the same signed visitor workspace.

The five views are Overview, Sources, Sessions, Answers (Replies in the retail example) and Repair history. Inspect an artifact to see its exact version, content hash, source quotation, recorded inputs and previous version. The lineage view draws recorded evidence from input to output. Its source filter, fit/zoom controls and keyboard input list complement the graph. Node buttons support keyboard inspection and return focus when their inspector closes.

For a custom workspace, build the initial work, open Sources, choose **Correct source text**, edit the full text with a reason, inspect affected outputs, then repair. Questions restricted to an independent source retain their exact original output and content hash. The **New workspace** form requires an explicit replacement acknowledgement before discarding current work. Source-note inspectors show exact quotations and character offsets.

To run the retail scenario, build the initial work, open Sources, correct the return window to fourteen days with an operator reason, inspect the stale artifacts, then choose **Repair affected work**. The entire replacement set is published together. The report lists rebuilt logical identities and preserved IDs/hashes. **Mark reviewed** changes internal review state and sends nothing. Stale or review-required work is blocked, including released historical records whose evidence changed.

Reset requires typing `RESET` and creates a fresh workspace generation. A new manual session starts empty; the UI does not invent agent outputs. Audit export contains the owned visitor's synthetic graph records and measured execution state.

## Recorded example

`/#/recorded/overview` presents three frozen stages: original, corrected and repaired. Its permanent header and banner identify it as recorded and read-only. The data comes from the documented local acceptance capture, curated as described in [asset provenance](ASSETS.md). It never calls inference, correction, repair or review APIs. Operators choose this mode explicitly; network or model failure never switches modes automatically.

`UNDOGRAPH_OFFLINE=1 npm run dev` disables remote bindings for recorded-only exploration and CI. Live inference then remains unavailable. Normal local live development uses the existing Wrangler authentication and remote Workers AI binding.

## Browser checks

`UNDOGRAPH_LIVE_AI=1 npm run test:e2e` runs the actual live flow with the authenticated local Worker and real provider, plus recorded layouts and browser regressions. Without that flag, the live-inference test is reported as skipped. Browser tests still need the local database for owned workspace/correction/dialog checks. They never fake live inference.

Screenshots are reviewed at 375, 768, 1024 and 1440 pixels. Native dialogs support Escape and restore keyboard focus. Visible focus, labels, color-independent statuses, reduced-motion CSS and a keyboard equivalent for graph navigation are included. Automated accessibility checks have bounded scope and complement manual keyboard/visual review.


## Landing page

The root page uses a graphite canvas, warm-white type and mint accents with the existing self-hosted fonts. Its wide dependency explorer steps through Original, Correct and Repair. The native SVG/CSS graph is permanently labeled an interactive synthetic illustration, changes only local display state and makes no API requests. It is separate from the captured recorded walkthrough and actual live runs. At narrow widths the dependency path reflows vertically, with the independent account reply kept visibly separate.

A return-case comparison shows why the 21-day case changes eligibility while the 7-day case still needs new evidence. The preservation panel describes the documented recorded artifact checks. A separate four-call/three-call comparison is explicitly one observed synthetic run and links to its verification record. [Landing research and direction](research/LANDING_REDESIGN.md) documents the five category comparables, visual references and bounded claims used for the redesign.

Hero and footer links open the read-only demo at `/#/recorded/overview`; **Open workspace** opens `/#/overview`. The workspace brand returns home. Existing hash routes remain directly addressable. Landing sections use ordinary fragment links and the FAQ uses native details/summary controls. The workspace loads as a separate chunk and receives keyboard focus on entry.

Eight landing tests cover isolated illustration state, keyboard activation, focused skip-link contrast and navigation, section navigation, both entry routes, returning home, five viewport sizes from 320 to 1440 pixels, reduced-motion layouts and content focus. Every viewport checks all three graph states for page overflow and clipped node labels. The complete live browser suite includes seventeen tests.

Custom-workspace browser checks enter and reload their own project inputs, correct source text, export evidence, reject missing source selections and check the form at a 375-pixel viewport. Workflow tests cover selective repair and exact independent preservation for project and research configurations with a test-only inference provider and the real database.
