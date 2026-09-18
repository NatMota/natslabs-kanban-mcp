# Kanban MCP

Built by **Natanael Mota** and used to organise the development of **[Vortex Files](https://vortexfiles.qvxx.ai/)**.

This is the headless MCP edition of the active Kanban MCP TypeScript implementation. It provides a local MCP server backed by SQLite. The companion web UI is intentionally not included. Projects and tickets are stored only on the machine running the server.

## Built while building Vortex Files

I used Kanban MCP to organise the work of building [Vortex Files](https://vortexfiles.qvxx.ai/), my file-sharing and client-portal product. It gave my coding agents a shared record of tasks, progress and what to work on next across sessions.

This repository shares the headless MCP server, without my private project data or companion web interface.

## Requirements

- Node.js 22 or newer and npm
- An MCP client supporting local stdio servers

## Install

```sh
npm ci
npm test
```

Start the server with `npm start`, or configure your MCP client as described in [SETUP.md](SETUP.md). A first run creates a new, empty database under `~/.kanban-mcp/kanban.db`. Set `KANBAN_DATA_DIR` to use a different writable directory. Existing databases are never bundled with this release.

## Features

The MCP interface supports project listing/creation, board and ticket lookup, ticket search, project metrics, column and ticket create/update/move/delete, ordering and Scrum estimates, epics, documentation links, ticket run-history, and batch inspection. Tickets moved to Done require a completion summary. Staging-lease tools coordinate shared staging/UAT operations; use them only when you intentionally manage a shared test environment. They do not contain staging credentials or connect to any hosted environment by themselves. See tool descriptions in the MCP client for parameters and behavior.

## Data and privacy

This is a local process, not a hosted service. Its stdio MCP transport has no authentication; connect only to clients and processes you trust. The included source code has no bundled customer board or credentials. Back up your database before replacing it.

## License

MIT, copyright Natanael Mota. Retain the copyright and permission notice in copies or substantial portions of the software. No visible in-app credit is required. See [LICENSE](LICENSE).
