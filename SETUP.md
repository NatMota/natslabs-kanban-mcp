# MCP client setup

Install dependencies and build from the `natslabs-kanban-mcp` release directory (Node.js 22 or newer):

```sh
npm ci
npm run build
```

Use Node.js 22 or newer. If your npm installation asks you to approve the native `better-sqlite3` install script, review that dependency and approve only that package, then reinstall. Do not disable script safeguards globally.

Configure your MCP client to launch `dist/mcp/server.js` with this directory as its working directory. Example:

```json
{
  "mcpServers": {
    "kanban": {
      "command": "node",
      "args": ["/absolute/path/to/natslabs-kanban-mcp/dist/mcp/server.js"],
      "env": {
        "KANBAN_DATA_DIR": "/absolute/path/to/your-private-kanban-data"
      }
    }
  }
}
```

The data-directory override is optional. Without it, the process uses `~/.kanban-mcp`. Use a directory writable only by your operating-system account. Restart the MCP client after changing its configuration.

Call `kanban_list_projects` to inspect the initially empty store. Create a project with `kanban_create_project`, then inspect it with `kanban_get_board`. This server is designed for local stdio use and does not authenticate callers.
