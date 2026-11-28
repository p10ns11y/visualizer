# 001 — Ensembly as the shared log, not a `@vercel/board` SQLite mirror

- **Date:** 2026-11-27
- **Status:** Proposed / Open Sync Design

## Decision

Visualizer uses **Ensembly**, adapted and extended for this cockpit, as the shared event and board log. It does not keep a second log in a `@vercel/board` SQLite file.

Cross-machine and multi-agent Ensembly syncing is still an open design slice. That slice explores Cloudflare Workers, hooks, and Cloudflare storage (Durable Objects, D1, and R2). None of those is selected here, and this repo does not add a Worker or a board package.

The Step 1 problem card titled "Local board SQLite log" still sits in the sample workspace. This record supersedes that card. The card text is unchanged in this step.

## What `@vercel/board` solves

Lookup on 2026-11-27: npm `@vercel/board` `0.56.1` (package page updated 2026-11-23), Apache-2.0, homepage `https://github.com/vercel/board`. The product page is [Vercel Board](https://vercel.com/docs/board). The changelog [Vercel Board is now available](https://vercel.com/changelog/vercel-board-is-now-available) is dated 18 Nov 2026. The hosted board is Experimental.

- **Cross-machine and multi-agent sync, with no board server to run.** The hosted log lives in Vercel's API. The stored shape is Team, Board, Channel, Thread, Message, plus one ordered event log. `tail`, `wait`, and watchers follow that log. `vercel board wait --mentions` blocks until a message mentions the actor. `local()`, from `@vercel/board/backend-local`, is the separate SQLite file under `.board/` used for offline development. That file is the mirror this decision refuses.
- **Collision-free task claiming.** `tasks claim` takes one ready task. A claim is a lease of up to 5 minutes. `tasks renew` extends it. When two workers claim the same task, one succeeds and the other fails with `task_claimed`. Labels filter the queue. A task can wait on another task. The states are `waiting`, `ready`, `claimed`, `blocked`, `completed`, `failed`, and `canceled`.
- **Actor attribution and scoped sandbox credentials.** An agent names itself with `--as` or `BOARD_PROFILE` and writes with the person's credentials. The board shows both, such as `fx via ada`. A deployment acts as its project with the deployment OIDC token. CI without a login sets `BOARD_TOKEN`. `sandboxPolicy()` gives a Vercel Sandbox network rules and a placeholder `BOARD_TOKEN`. The proxy fills the credential outside the sandbox, and the profile cannot be widened from inside.
- **External sync and a headless surface.** Sync maps Slack, GitHub, and Linear through Vercel Connect. Slack and Linear sync both ways. GitHub pull requests and issues come onto the board by default, and replies go back to GitHub only when that direction is turned on. The CLI and `@vercel/board` are the headless surface. `npx @vercel/board inspect` is a local viewer of the hosted board, not a second store.

## Where `@vercel/board` does not replace Ensembly plus Cloudflare sync

- **Lock-in and data residency.** The hosted board stores messages, threads, tasks, labels, and attachments in the United States. There is no region setting, so an EU store is not a choice. The feature is Experimental. It is free while experimental, and Vercel may charge later. Slack, GitHub, and Linear sync depend on Vercel Connect, and Board grants do not apply on those platforms.
- **A completion line is not verified memory.** `tasks complete` records that a claim ended. It does not replace Ensembly's append-only ledger, promotion into Pulse Memory under `canPromote`, workflow lessons on the Neo4j projection, or the XState 6 railway checked by `pnpm verify:formal`.
- **Channel posts are instructions.** The board docs say agents read messages as instructions, and a task's text tells whichever worker claims it what to do. A sync from Slack, GitHub, or Linear can put outside text on that queue. Channel write grants have to stay narrow. Ensembly promotion still follows `canPromote` on this workspace.

## Practical play

Borrow the primitives into the open Ensembly sync design: an atomic claim lease, `agent via human` attribution, a scoped sandbox token, and a live tail. The host for that design is Cloudflare Workers, hooks, and Cloudflare storage (Durable Objects, D1, or R2), still unchosen.

If several harnesses need a shared tail before that Cloudflare slice exists, `@vercel/board` may sit behind a port as an optional transport. It stays swappable. It does not become the ledger, and `local()` does not become a SQLite mirror of the Ensembly log.
