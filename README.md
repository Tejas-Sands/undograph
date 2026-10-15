# UndoGraph

UndoGraph repairs an agent's stored context and pending work after an operator corrects a source. FalkorDB records the input dependencies that determine which artifacts become stale and which work must run again.

The proposed first demo is a fictional customer-support workspace. Correct a return window from 30 days to 14 days, inspect affected work from two agent sessions, regenerate pending replies, and verify that an unrelated password-reset reply retains its original version and content.

## Project documents

- [Product and technical specification](DESIGN.md)
- [Implementation plan](IMPLEMENTATION_PLAN.md)

Target deployment: a React application and API on Cloudflare Workers, durable runs on Cloudflare Workflows, inference on Workers AI, and an external FalkorDB instance. FalkorDB remains the canonical application database.

## Current status

This folder contains preparation notes and an implementation plan. Application code, dependencies, cloud resources, and deployment have not been created. The proposed architecture requires an early verification of the official FalkorDB client in the Workers runtime against the selected database endpoint.

The Graph Hacks event starts October 15, 2026 at 12:01 AM IST and closes October 18 at 11:59 PM IST. Its rules permit preparation notes beforehand and require the main coding and design work to start during the event. This application must be implemented as new work during that window. [Official rules](https://www.wemakedevs.org/hackathons/falkordb/rules)

## Intended result

A publicly accessible Cloudflare demo with synthetic data, isolated visitor workspaces, actual recorded agent runs, inspectable dependency paths, recoverable failures, and a reproducible comparison before and after repair. Recorded examples may provide an explicitly labeled read-only walkthrough; they must never be presented as live inference.

Primary track: Agent Memory and Coordination. Secondary track: Agents That Act on Connected Data, provided the final implementation demonstrates graph-driven repair actions.
