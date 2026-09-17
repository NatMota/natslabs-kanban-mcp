const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');

function startServer(dataDirectory) {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../dist/mcp/server.js')], {
    env: { ...process.env, KANBAN_DATA_DIR: dataDirectory },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  const waiting = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined && waiting.has(message.id)) {
        const { resolve, reject } = waiting.get(message.id);
        waiting.delete(message.id);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      }
    }
  });
  let nextId = 1;
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    setTimeout(() => {
      if (waiting.has(id)) {
        waiting.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }
    }, 5000).unref();
  });
  const notify = (method, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  return { child, request, notify };
}

function toolData(result) {
  if (result.structuredContent) return result.structuredContent;
  return JSON.parse(result.content[0].text);
}

async function closeServer(child) {
  child.kill('SIGTERM');
  await once(child, 'exit');
}

test('stdio MCP initializes, edits a board, and persists across restart', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-mcp-stdio-'));
  try {
    let server = startServer(dataDirectory);
    const initialized = await server.request('initialize', {
      protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'release-test', version: '1' },
    });
    assert.equal(initialized.serverInfo.name, 'kanban-project-hub');
    server.notify('notifications/initialized');
    const tools = await server.request('tools/list');
    assert.ok(tools.tools.some((tool) => tool.name === 'kanban_create_ticket'));
    assert.ok(tools.tools.some((tool) => tool.name === 'kanban_get_board'));
    const projectResult = await server.request('tools/call', {
      name: 'kanban_create_project', arguments: { key: 'qa-board', name: 'QA Board' },
    });
    assert.equal(toolData(projectResult).project.key, 'qa-board');
    const ticketResult = await server.request('tools/call', {
      name: 'kanban_create_ticket', arguments: { projectKey: 'qa-board', title: 'Persist me', columnName: 'Backlog' },
    });
    assert.equal(toolData(ticketResult).ticket.title, 'Persist me');
    await closeServer(server.child);

    server = startServer(dataDirectory);
    await server.request('initialize', {
      protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'release-test', version: '1' },
    });
    server.notify('notifications/initialized');
    const boardResult = await server.request('tools/call', {
      name: 'kanban_get_board', arguments: { projectKey: 'qa-board' },
    });
    const board = toolData(boardResult).board;
    assert.equal(board.project.key, 'qa-board');
    assert.equal(board.columns.flatMap((column) => column.tickets).some((ticket) => ticket.title === 'Persist me'), true);
    await closeServer(server.child);
  } finally {
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});
