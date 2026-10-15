# Operations workspace

Run the app locally and open `http://127.0.0.1:5173`. Starting a live workspace creates only synthetic source/case inputs. **Build agent work** launches the actual durable build; counters change only when server snapshots contain persisted records. Active runs poll every two seconds, pause requests while the document is hidden and refresh on focus. Reload recovers the same signed visitor workspace.

The five views are Overview, Sources, Sessions, Replies and Repair history. Inspect an artifact to see its exact version, content hash, source quotation, recorded inputs and previous version. The lineage view draws recorded evidence from input to output. Its source filter, fit/zoom controls and keyboard input list complement the graph. Node buttons support keyboard inspection and return focus when their inspector closes.

To run the scenario, build the initial work, open Sources, correct the return window to fourteen days with an operator reason, inspect the stale artifacts, then choose **Repair affected work**. The entire replacement set is published together. The report lists rebuilt logical identities and preserved IDs/hashes. **Mark reviewed** changes internal review state and sends nothing. Stale or review-required work is blocked, including released historical records whose evidence changed.

Reset requires typing `RESET` and creates a fresh workspace generation. A new manual session starts empty; the UI does not invent agent outputs. Audit export contains the owned visitor's synthetic graph records and measured execution state.

## Recorded example

`/#/recorded/overview` presents three frozen stages: original, corrected and repaired. Its permanent header and banner identify it as recorded and read-only. The data comes from the documented local acceptance capture, curated as described in [asset provenance](ASSETS.md). It never calls inference, correction, repair or review APIs. Operators choose this mode explicitly; network or model failure never switches modes automatically.

`UNDOGRAPH_OFFLINE=1 npm run dev` disables remote bindings for recorded-only exploration and CI. Live inference then remains unavailable. Normal local live development uses the existing Wrangler authentication and remote Workers AI binding.

## Browser checks

`UNDOGRAPH_LIVE_AI=1 npm run test:e2e` runs the actual live flow with the authenticated local Worker and real provider, plus recorded layouts and browser regressions. Without that flag, the live-inference test is reported as skipped. Browser tests still need the local database for owned workspace/correction/dialog checks. They never fake live inference.

Screenshots are reviewed at 375, 768, 1024 and 1440 pixels. Native dialogs support Escape and restore keyboard focus. Visible focus, labels, color-independent statuses, reduced-motion CSS and a keyboard equivalent for graph navigation are included. Automated accessibility checks have bounded scope and complement manual keyboard/visual review.
