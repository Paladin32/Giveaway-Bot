# Secret Giveaway Bot

A Discord bot for timed giveaways, private winner selection, and prize claim deadlines.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server and giveaway bot (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret to connect the bot: `DISCORD_BOT_TOKEN`
- Optional env: `GIVEAWAY_DATA_FILE` — override the local JSON file used to persist giveaways

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild
- Discord: discord.js slash commands and Gateway events

## Where things live

- `artifacts/api-server/src/giveaway/` — giveaway state, slash commands, Discord handlers, and message presentation.
- Giveaway records are stored in `.data/giveaway-bot.json` by default and are not committed.

## Architecture decisions

- Winner choices and claim details are never included in public giveaway messages; selection and claim notifications are private.
- Giveaways survive bot process restarts using the local JSON store.

## Product

- `/giveaway-create` posts a giveaway with prize, duration, claim time, description, and eligibility requirement.
- Entrants join using a button. `/giveaway-pick` privately selects an entrant; if none is selected, the bot draws randomly at close.
- `/giveaway-end` closes a giveaway early; `/giveaway-list` privately lists running giveaways in the server.
- Winners receive a private claim button and have the configured claim time to use it.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
