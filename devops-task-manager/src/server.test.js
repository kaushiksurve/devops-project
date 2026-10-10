const assert = require('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test');
const { createServer } = require('./server');

let server;
let baseUrl;

beforeEach(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('serves the health check and frontend', async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /DevOps Task Manager/);
});

test('creates, lists, updates, and deletes tasks', async () => {
  const createdResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '  Add automated tests  ' })
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.title, 'Add automated tests');
  assert.equal(created.completed, false);
  assert.ok(Number.isFinite(Date.parse(created.createdAt)));

  const listResponse = await fetch(`${baseUrl}/api/tasks`);
  assert.deepEqual(await listResponse.json(), [created]);

  const updateResponse = await fetch(`${baseUrl}/api/tasks/${created.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ completed: true })
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).completed, true);

  const deleteResponse = await fetch(`${baseUrl}/api/tasks/${created.id}`, {
    method: 'DELETE'
  });
  assert.equal(deleteResponse.status, 204);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/tasks`)).json(), []);
});

test('rejects empty, oversized, and malformed task requests', async () => {
  const emptyTitle = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '   ' })
  });
  assert.equal(emptyTitle.status, 400);

  const oversizedTitle = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'a'.repeat(201) })
  });
  assert.equal(oversizedTitle.status, 400);

  const malformedJson = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{'
  });
  assert.equal(malformedJson.status, 400);
});

test('returns 404 when updating a task that does not exist', async () => {
  const response = await fetch(`${baseUrl}/api/tasks/00000000-0000-4000-8000-000000000000`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ completed: true })
  });
  assert.equal(response.status, 404);
});
