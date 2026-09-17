const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-mcp-public-'));
process.env.KANBAN_DATA_DIR = dataDirectory;
const { createProject, getBoardByProjectKey, listProjects } = require('../dist/dataStore.js');
const db = require('../dist/db.js').default;

after(() => {
  db.close();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test('fresh database is empty until a project is created', () => {
  assert.deepEqual(listProjects(), []);
  createProject({ key: 'qa-board', name: 'QA Board' });
  const board = getBoardByProjectKey('qa-board');
  assert.equal(board.project.name, 'QA Board');
  assert.ok(board.columns.length > 0);
});
