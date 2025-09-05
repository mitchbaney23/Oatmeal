# Codex Config and Working Notes

This repository is a monorepo for a Tauri + React desktop app with multiple packages. Use npm workspaces and keep changes focused and minimal.

## Priorities
- Accuracy first: fix root causes, avoid speculative edits.
- Stay concise: small, targeted diffs and clear messages.
- Respect the monorepo: use existing scripts and structure.

## Project Commands
- Install: `npm install`
- Build: `npm run build`
- Tests: `npm run test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Desktop dev: `npm run tauri:dev`

## Conventions
- Use `apply_patch` to modify files; do not over-edit unrelated areas.
- Prefer `rg` for searching and read files in <=250 line chunks.
- Avoid adding new dependencies unless necessary.
- Don’t commit or create branches from the agent; leave VCS steps to the user.

## Scope Filters
Codex should focus on:
- `apps/**`, `packages/**`, `scripts/**`
- Top-level config: `package.json`, `tsconfig.base.json`, `tailwind.config.js`, `.eslintrc.js`, `.prettierrc`, `turbo.json`

Ignore noisy/generated paths:
- `node_modules/**`, `.turbo/**`, `dist/**`, `build/**`, `.git/**`

## Notes
- This repo includes a detailed `CLAUDE.md` project overview. Use it for context on features and architecture.
- Keep user-facing guidance and docs consistent with existing style.

## MCP: Playwright
- Server: `@modelcontextprotocol/server-playwright` via `npx`.
- Configured in `codex.yaml` under `mcpServers.playwright`.
- Requirements: Node 18+, network access on first run for `npx` install, and Playwright’s browsers (handled by the server on demand).
- Defaults: `HEADLESS=1`. You can set `BROWSER` to `CHROMIUM`, `FIREFOX`, or `WEBKIT` if needed.

