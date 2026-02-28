# Design: robots.txt, llms.txt, and MCP Interface

**Date:** 2026-02-28
**Status:** Approved

## Summary

Add three pieces of public-facing infrastructure:

1. **robots.txt** — static file blocking crawlers from data-modifying API paths
2. **llms.txt** — dynamic route serving club info and public API docs, populated from DB settings
3. **MCP server** — read-only Model Context Protocol server for agent interoperability

## 1. robots.txt

Static file at `public/robots.txt`, served via `express.static`.

- Allows `/`, `/llms.txt`, `/.well-known/`, and read-only API endpoints (`/api/events`, `/api/calendar`, `/api/players`, `/api/attendance`, `/api/health`)
- Blocks `/api/settings`, `/api/whatsapp`, `/api/broadcasts`, and wildcard write patterns (`/api/*/create`, `/api/*/update`, `/api/*/delete`)

## 2. llms.txt

Dynamic Express route at `GET /llms.txt` in `server/src/routes/llms.ts`.

- Reads club name, description, and contact info from the `settings` table
- Queries live stats: player count, upcoming event count
- Falls back to sensible defaults when settings are not yet configured
- Follows the llms.txt proposal format (heading, description, sections for public data, API endpoints, statistics, integration, contact)
- Mounted directly on the app (not under `/api`)

## 3. MCP Server

Lightweight MCP server in `server/src/mcp/` using `@modelcontextprotocol/sdk`.

### Tools

| Tool | Description | Returns |
|------|-------------|---------|
| `get_club_info` | Club name, description, languages, contact | Settings object |
| `list_upcoming_events` | Events from today onwards, optional limit | Array of events |
| `get_attendance_stats` | Aggregated attendance rates | Stats object |
| `get_player_categories` | Age categories with player counts | Array of categories |

### Design Decisions

- **Read-only only** — no data-modifying tools
- **No authentication** — public aggregated stats only, no PII exposed
- **Streamable HTTP transport** — standard MCP transport over HTTP at `/mcp`
- **Reuses existing DB** — calls `getDB()` directly

### Files

- `server/src/mcp/server.ts` — MCP server definition with tool handlers
- `server/src/mcp/index.ts` — Express integration, router mounted at `/mcp`

### Integration

```ts
import { mcpRouter } from "./mcp/index.js";
app.use("/mcp", mcpRouter);
```

### Dependency

- `@modelcontextprotocol/sdk` added to server package.json

## Static File Serving

`express.static("public")` middleware added to `server/src/index.ts` to serve `robots.txt` and other static assets from `public/`.
