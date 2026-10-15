# UndoGraph landing-page research and direction

Research date: October 15, 2026. Scope: improve the existing landing page's visual quality and product clarity. This is desk research and a design assessment, not validated customer research or a market-size study.

Applied the user-added `deep-research` and `competitor-analysis` skills from the sibling `research-skills/` directory. Research covered five angles: agent-memory positioning, provenance and changing facts, current technical-product page composition, developer proof, and accessible interaction/motion. The startup-risk and opportunity-tree skills do not fit this bounded interface redesign.

## Current-page audit

The existing page works but gives the core graph only half a hero, uses 8–10px diagram metadata, and repeats an evenly spaced three-step/feature pattern. Its off-white surfaces, blue buttons and report illustration establish a competent dashboard aesthetic, but the hierarchy does not give the product's central idea enough visual weight. This is a design judgment informed by the rendered page and the user's feedback.

The redesigned page should make this sequence legible immediately: an operator corrects one source; five dependent outputs require repair; the independent account reply stays unchanged. The product is a working synthetic demonstration, so it must retain clear illustrative/recorded/live boundaries.

## Comparable products

These are five relevant alternatives in agent memory/context, rather than five proven equivalents to UndoGraph's repair workflow. Descriptions reflect their own published positioning; they are not independent capability or performance evaluations.

| Product and primary source | Published emphasis | Lesson for UndoGraph |
| --- | --- | --- |
| [Mem0](https://mem0.ai/) | Persistent context for agents/apps with an immediate integration example | Name the product category clearly, then make the next action concrete. |
| [Zep](https://www.getzep.com/) and [temporal graph explanation](https://www.getzep.com/ai-agents/temporal-knowledge-graph/) | Governed context graphs, dated facts and source provenance | Show exact source versions and the consequences of changing a fact. Provenance alone is not a uniqueness claim. |
| [Letta Agent SDK](https://www.letta.com/agent-sdk/) | Stateful agents with agent-owned, versioned memory | Make the durable records inspectable. Keep UndoGraph's narrower correction/repair demonstration explicit. |
| [Supermemory](https://supermemory.ai/) | Interoperable memory and continual learning through an API, plugins and MCP | Separate category framing from evidence; avoid unsupported universal-memory promises. |
| [Cognee](https://www.cognee.ai/) | Connected knowledge and memory for agents, teams and people | Tie the graph to a concrete operator problem rather than treating it as background decoration. |

Pricing, funding, market share, customer counts and claims about missing competitor features were not needed to decide the landing-page design and are not asserted. A current public page cannot prove that a competitor lacks a feature. UndoGraph should lead with the specific behavior its own implementation verifies, rather than an unsupported superiority claim.

## Visual references and interpretation

- [Linear](https://linear.app/): a large actual product representation follows a restrained headline and navigation. Apply the relative scale and clear hierarchy, with an original UndoGraph composition and graph.
- [Resend](https://resend.com/): a short category statement and precise developer entry points make the page's purpose readable quickly. Apply the clarity and controlled contrast, without copying its text, artwork or layout.
- The memory-product pages above give useful examples of concrete diagrams, integration context and visible evidence. Their customer logos, statistics and commercial assurances do not transfer to UndoGraph.

These design lessons are observations and interpretation, not measured conversion findings. Raw reference screenshots remain local research artifacts; no third-party screenshot, logo, copy or illustration is shipped as a product asset.

## Chosen direction

Use a dark graphite canvas, warm-white type and a restrained mint accent. Retain IBM Plex Sans, JetBrains Mono and the existing icon family. Give the headline and a wide dependency workbench most of the initial page; avoid squeezing the graph into a small decorative card. Keep the three original/corrected/repaired states operable, with readable version labels, visible dependency paths and a separate independent path.

Follow with a concrete case comparison, inspectable preservation evidence and the recorded local call comparison. Label any measurement as one observed synthetic run and link its verification record. Do not turn a call-count reduction into a latency or universal performance guarantee. End with concise questions and explicit recorded-demo/live-workspace entry points.

Keep the implementation in the existing React app, with native CSS/SVG and no new UI framework or service. Preserve all workspace URLs and backend behavior. The landing page remains read-only and must make no API requests by itself.

## Accessibility and limits

[W3C contrast guidance](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) supports testing normal text at 4.5:1 and large text at 3:1. [Focus guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible) requires a visible keyboard focus mode. [Interaction-animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) informs respecting reduced-motion preferences and avoiding unnecessary motion.

Use text/icons alongside every color state, native buttons and details, keyboard-operable stage controls, and no autoplay narrative. Check 375, 768, 1024 and 1440px layouts, zoom/reflow, reduced motion, contrast and both entry paths. Browser and accessibility checks establish implementation behavior; they do not establish that a user will prefer this art direction. The user's review remains the aesthetic test.
