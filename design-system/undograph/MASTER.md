# UndoGraph operations workspace

The approved product direction in DESIGN.md takes precedence over generic catalog suggestions. UI/UX Pro Max's data-dense dashboard and blue/amber semantic palette fit this product; its generated enterprise marketing pattern and Fira font suggestion do not. The operations workspace has no sales sections; fonts stay self-hosted.

Use a charcoal navigation rail, off-white canvas, white work surfaces, restrained borders and blue primary actions. Amber means stale or needs review; green means completed or preserved. Pair all status colors with text and icons. Body text uses licensed, self-hosted IBM Plex Sans; technical identifiers use JetBrains Mono. CSS custom properties in src/index.css define the implementation tokens.

The desktop workspace has navigation, a central work surface and an inspectable lineage/detail panel. Mobile stacks these areas, keeps navigation reachable and provides the same provenance through a keyboard-accessible path list. Main views are Overview, Sources, Sessions, Replies and Repair history. One primary action reflects the next actual server step. Empty, loading, error, failed and obsolete states remain explicit.

Use 4/8px spacing, 16px body text, clear focus indicators, semantic controls, visible form labels, minimum 44px main touch controls and reduced-motion support. Dialogs use the native modal element, including focus containment, Escape dismissal and an explicit cancel action. Text wraps rather than causing horizontal page scrolling.

All live counters, sessions, progress and lineage come from persisted server records. Model failure never switches mode. Recorded walkthrough data is explicitly frozen and read-only, with permanent labeling and no mutation requests. Graph arrows read input to output; an adjacent path list is the equivalent accessible view.


The separately requested landing page introduces the product at the root URL. Use an off-white canvas, large IBM Plex Sans headings, blue primary actions, a compact interactive dependency illustration and a charcoal proof section. Its styling is scoped to landing components. Diagram/report content stays explicitly illustrative; demo and live actions remain separate. Existing workspace routes, data and visual tokens remain in place.
