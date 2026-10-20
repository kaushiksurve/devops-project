process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const bcrypt = require('bcryptjs');
const { createPool, initializeDatabase } = require('./db');
const { createApp } = require('./server');

let pool;
let server;
let baseUrl;
let googleFetchImpl;

before(async () => {
  pool = createPool();
  await initializeDatabase(pool);
  process.env.GOOGLE_CLIENT_ID = 'test-google-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';
  server = createApp(pool, {
    fetchImpl: (...args) => googleFetchImpl(...args)
  }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await pool.query('DELETE FROM tasks');
  await pool.query('DELETE FROM users');
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (pool) await pool.end();
});

async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const setCookie = response.headers.get('set-cookie');
  const sessionCookie = setCookie?.match(/taskflow\.sid=[^;]+/)?.[0] || cookie;
  const contentType = response.headers.get('content-type') || '';
  const data = response.status === 204
    ? null
    : contentType.includes('application/json')
      ? await response.json()
      : await response.text();
  return { response, data, cookie: sessionCookie, setCookie };
}

async function registerAccount(overrides = {}) {
  const result = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Taylor Example',
      email: 'taylor@example.com',
      password: 'safe-demo-passphrase-2026',
      ...overrides
    }
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  assert.ok(result.cookie, 'registration should establish a session cookie');
  return result;
}

test('serves the dashboard, reports database health, and requires sign-in for tasks', async () => {
  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.data, { status: 'ok' });

  const page = await request('/');
  assert.equal(page.response.status, 200);
  assert.match(page.data, /Create account/);

  const auth = await request('/api/auth/me');
  assert.deepEqual(auth.data, { user: null });

  const tasks = await request('/api/tasks');
  assert.equal(tasks.response.status, 401);

  const createTask = await request('/api/tasks', {
    method: 'POST',
    body: { title: 'Not authorized' }
  });
  assert.equal(createTask.response.status, 401);

  const updateProfile = await request('/api/auth/profile', {
    method: 'PATCH',
    body: { name: 'No account' }
  });
  assert.equal(updateProfile.response.status, 401);

  const logout = await request('/api/auth/logout', { method: 'POST' });
  assert.equal(logout.response.status, 401);
});

  test('starts Google OAuth with session-bound state and PKCE', async () => {
    const result = await request('/api/auth/google');
    assert.equal(result.response.status, 302);
    const authorization = new URL(result.response.headers.get('location'));
    assert.equal(authorization.origin, 'https://accounts.google.com');
    assert.equal(authorization.searchParams.get('client_id'), 'test-google-client');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(authorization.searchParams.get('code_challenge'));
    assert.ok(authorization.searchParams.get('state'));
    assert.ok(result.cookie);
  });

  test('Google callback verifies state, creates a passwordless user, and establishes a session', async () => {
    const start = await request('/api/auth/google');
    const authorization = new URL(start.response.headers.get('location'));
    const state = authorization.searchParams.get('state');

    let verifiedChallenge;
    googleFetchImpl = async (url, options) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        const body = new URLSearchParams(options.body);
        verifiedChallenge = createHash('sha256').update(body.get('code_verifier')).digest('base64url');
        return Response.json({ access_token: 'mock-access-token', token_type: 'Bearer' });
      }
      assert.equal(url, 'https://openidconnect.googleapis.com/v1/userinfo');
      assert.equal(options.headers.authorization, 'Bearer mock-access-token');
      return Response.json({
        sub: 'google-user-123',
        email: 'google.user@example.com',
        email_verified: true,
        name: 'Google User'
      });
    };
    const callback = await request(`/api/auth/google/callback?code=mock-code&state=${encodeURIComponent(state)}`, {
      cookie: start.cookie
    });
    assert.equal(callback.response.status, 302);
    assert.equal(callback.response.headers.get('location'), '/?signed_in=google');
    assert.ok(callback.cookie);
    assert.notEqual(callback.cookie, start.cookie);
    const user = await pool.query(
      'SELECT id, name, email, password_hash, google_sub FROM users WHERE email = $1',
      ['google.user@example.com']
    );
    assert.equal(user.rowCount, 1);
    assert.equal(user.rows[0].name, 'Google User');
    assert.equal(user.rows[0].password_hash, null);
    assert.equal(user.rows[0].google_sub, 'google-user-123');
    assert.equal(verifiedChallenge, authorization.searchParams.get('code_challenge'));
    const session = await request('/api/auth/me', { cookie: callback.cookie });
    assert.equal(session.data.user.id, user.rows[0].id);
    const passwordLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'google.user@example.com', password: 'not-a-google-password' }
    });
    assert.equal(passwordLogin.response.status, 401);
  });

  test('rejects a Google callback with an invalid OAuth state without calling Google', async () => {
    const start = await request('/api/auth/google');
    let called = false;
    googleFetchImpl = async () => {
      called = true;
      throw new Error('Unexpected Google request.');
    };
    const callback = await request('/api/auth/google/callback?code=mock-code&state=wrong-state', {
      cookie: start.cookie
    });
    assert.equal(callback.response.status, 302);
    assert.equal(callback.response.headers.get('location'), '/');
    assert.equal(called, false);
    const session = await request('/api/auth/me', { cookie: callback.cookie });
    assert.equal(session.data.user, null);
    assert.match(session.data.oauthError, /could not be verified/);
  });
test('registers an account, persists its profile, supports login and logout', async () => {
  const registration = await registerAccount({
    name: '  Taylor Example  ',
    email: ' Taylor@Example.com '
  });
  assert.equal(registration.data.user.name, 'Taylor Example');
  assert.equal(registration.data.user.email, 'taylor@example.com');
  assert.ok(Number.isFinite(Date.parse(registration.data.user.createdAt)));
  assert.equal(Object.hasOwn(registration.data.user, 'password_hash'), false);
  assert.match(registration.setCookie, /HttpOnly/i);
  assert.match(registration.setCookie, /SameSite=Lax/i);
  const storedPassword = await pool.query('SELECT password_hash FROM users WHERE id = $1', [registration.data.user.id]);
  assert.notEqual(storedPassword.rows[0].password_hash, 'safe-demo-passphrase-2026');
  assert.equal(await bcrypt.compare('safe-demo-passphrase-2026', storedPassword.rows[0].password_hash), true);

  const profile = await request('/api/auth/me', { cookie: registration.cookie });
  assert.equal(profile.data.user.id, registration.data.user.id);

  const updated = await request('/api/auth/profile', {
    method: 'PATCH',
    cookie: registration.cookie,
    body: { name: 'Taylor Updated' }
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.user.name, 'Taylor Updated');

  const loggedOut = await request('/api/auth/logout', {
    method: 'POST',
    cookie: registration.cookie
  });
  assert.equal(loggedOut.response.status, 204);
  const afterLogout = await request('/api/auth/me', { cookie: registration.cookie });
  assert.deepEqual(afterLogout.data, { user: null });

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'TAYLOR@example.com', password: 'safe-demo-passphrase-2026' }
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.data.user.id, registration.data.user.id);
  assert.notEqual(login.cookie, registration.cookie, 'login should rotate the session identifier');

  const invalidLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'taylor@example.com', password: 'incorrect-password-2026' }
  });
  assert.equal(invalidLogin.response.status, 401);

  const overlongLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'taylor@example.com', password: `safe-demo-passphrase-2026${'x'.repeat(80)}` }
  });
  assert.equal(overlongLogin.response.status, 401);
});

test('validates registration and profile input and prevents duplicate accounts', async () => {
  const shortPassword = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Taylor', email: 'taylor@example.com', password: 'short' }
  });
  assert.equal(shortPassword.response.status, 400);

  const longUtf8Password = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Taylor', email: 'taylor@example.com', password: '😀'.repeat(20) }
  });
  assert.equal(longUtf8Password.response.status, 400);

  const invalidEmail = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Taylor', email: 'not-an-email', password: 'safe-demo-passphrase-2026' }
  });
  assert.equal(invalidEmail.response.status, 400);

  const account = await registerAccount();
  const duplicate = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Another User', email: 'TAYLOR@example.com', password: 'another-safe-passphrase-2026' }
  });
  assert.equal(duplicate.response.status, 409);

  const invalidProfile = await request('/api/auth/profile', {
    method: 'PATCH',
    cookie: account.cookie,
    body: { name: 'x' }
  });
  assert.equal(invalidProfile.response.status, 400);
});

test('stores tasks persistently and isolates every operation by account', async () => {
  const owner = await registerAccount();
  const otherUser = await registerAccount({
    name: 'Jordan Example',
    email: 'jordan@example.com'
  });

  const created = await request('/api/tasks', {
    method: 'POST',
    cookie: owner.cookie,
    body: { title: '  Review deployment  ' }
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.title, 'Review deployment');
  assert.equal(created.data.completed, false);
  assert.equal(created.data.status, 'todo');
  assert.equal(created.data.priority, 'medium');
  assert.deepEqual(created.data.tags, []);
  assert.ok(Number.isFinite(Date.parse(created.data.createdAt)));

  const ownerTasks = await request('/api/tasks', { cookie: owner.cookie });
  assert.deepEqual(ownerTasks.data.map((task) => task.id), [created.data.id]);
  const otherTasks = await request('/api/tasks', { cookie: otherUser.cookie });
  assert.deepEqual(otherTasks.data, []);

  const forbiddenUpdate = await request(`/api/tasks/${created.data.id}`, {
    method: 'PATCH',
    cookie: otherUser.cookie,
    body: { completed: true }
  });
  assert.equal(forbiddenUpdate.response.status, 404);
  const malformedTaskId = await request('/api/tasks/not-a-uuid', {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { completed: true }
  });
  assert.equal(malformedTaskId.response.status, 404);

  const updated = await request(`/api/tasks/${created.data.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { status: 'in_progress', priority: 'high', tags: ['docker', 'staging'] }
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.status, 'in_progress');
  assert.equal(updated.data.completed, false);
  assert.equal(updated.data.priority, 'high');
  assert.deepEqual(updated.data.tags, ['docker', 'staging']);

  const invalidUpdate = await request(`/api/tasks/${created.data.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { status: 'blocked' }
  });
  assert.equal(invalidUpdate.response.status, 400);

  const invalidPriority = await request(`/api/tasks/${created.data.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { priority: 'urgent' }
  });
  assert.equal(invalidPriority.response.status, 400);

  const invalidTags = await request(`/api/tasks/${created.data.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { tags: ['docker', 'unknown'] }
  });
  assert.equal(invalidTags.response.status, 400);

  const legacyComplete = await request(`/api/tasks/${created.data.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { completed: true }
  });
  assert.equal(legacyComplete.data.status, 'done');
  assert.equal(legacyComplete.data.completed, true);

  const conflictingCompletion = await request(`/api/tasks/${created.data.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { status: 'review', completed: true }
  });
  assert.equal(conflictingCompletion.response.status, 400);

  const forbiddenDelete = await request(`/api/tasks/${created.data.id}`, {
    method: 'DELETE',
    cookie: otherUser.cookie
  });
  assert.equal(forbiddenDelete.response.status, 404);

  const deleted = await request(`/api/tasks/${created.data.id}`, {
    method: 'DELETE',
    cookie: owner.cookie
  });
  assert.equal(deleted.response.status, 204);
  assert.deepEqual((await request('/api/tasks', { cookie: owner.cookie })).data, []);
});

test('validates and persists task priorities, tags, and workflow statuses', async () => {
  const account = await registerAccount();
  const created = await request('/api/tasks', {
    method: 'POST',
    cookie: account.cookie,
    body: {
      title: 'Deploy production service',
      priority: 'blocker',
      tags: ['prod', 'infra', 'ci/cd']
    }
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.priority, 'blocker');
  assert.deepEqual(created.data.tags, ['prod', 'infra', 'ci/cd']);

  for (const status of ['in_progress', 'review', 'done', 'todo']) {
    const updated = await request(`/api/tasks/${created.data.id}`, {
      method: 'PATCH',
      cookie: account.cookie,
      body: { status }
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.data.status, status);
    assert.equal(updated.data.completed, status === 'done');
  }

  const invalidPriority = await request('/api/tasks', {
    method: 'POST',
    cookie: account.cookie,
    body: { title: 'Invalid priority', priority: 'urgent' }
  });
  assert.equal(invalidPriority.response.status, 400);

  const invalidTag = await request('/api/tasks', {
    method: 'POST',
    cookie: account.cookie,
    body: { title: 'Invalid tag', tags: ['production'] }
  });
  assert.equal(invalidTag.response.status, 400);

  const invalidTagCount = await request('/api/tasks', {
    method: 'POST',
    cookie: account.cookie,
    body: { title: 'Duplicate tags', tags: ['prod', 'prod'] }
  });
  assert.equal(invalidTagCount.response.status, 400);
});

test('rejects cross-origin writes, malformed JSON, and oversized requests', async () => {
  const crossOrigin = await request('/api/auth/register', {
    method: 'POST',
    headers: { origin: 'https://attacker.example' },
    body: { name: 'Taylor', email: 'taylor@example.com', password: 'safe-demo-passphrase-2026' }
  });
  assert.equal(crossOrigin.response.status, 403);

  const malformed = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{'
  });
  assert.equal(malformed.status, 400);

  const oversized = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a'.repeat(17000), password: 'invalid' })
  });
  assert.equal(oversized.status, 413);
});

test('refuses known development credentials in production mode', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldSessionSecret = process.env.SESSION_SECRET;
  const oldDatabasePassword = process.env.PGPASSWORD;
  process.env.NODE_ENV = 'production';
  process.env.SESSION_SECRET = 'local-only-replace-this-session-secret-before-deployment-32chars';
  process.env.PGPASSWORD = 'taskflow-app-local-only';
  try {
    assert.throws(
      () => createApp(pool),
      /Production requires unique SESSION_SECRET and PostgreSQL credentials/
    );
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = oldSessionSecret;
    if (oldDatabasePassword === undefined) delete process.env.PGPASSWORD;
    else process.env.PGPASSWORD = oldDatabasePassword;
  }
});
