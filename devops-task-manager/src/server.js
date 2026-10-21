const path = require('node:path');
const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} = require('node:crypto');
const { createPool, initializeDatabase } = require('./db');

const publicDirectory = path.join(__dirname, '..', 'public');
const SESSION_COOKIE = 'taskflow.sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_MAX_BYTES = 72;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_SESSION_SECRET = 'local-only-replace-this-session-secret-before-deployment-32chars';
const LOCAL_DATABASE_PASSWORD = 'taskflow-app-local-only';
const TASK_STATUSES = new Set(['todo', 'in_progress', 'review', 'done']);
const TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'blocker']);
const TASK_TAGS = new Set(['prod', 'staging', 'ci/cd', 'infra', 'docker', 'db']);
const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function googleRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left || '');
  const rightBuffer = Buffer.from(right || '');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function findOrCreateGoogleUser(pool, profile) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingGoogleUser = await client.query(
      `SELECT id, name, email, created_at AS "createdAt"
       FROM users WHERE google_sub = $1 FOR UPDATE`,
      [profile.sub]
    );
    if (existingGoogleUser.rowCount) {
      await client.query('COMMIT');
      return existingGoogleUser.rows[0];
    }

    const existingEmailUser = await client.query(
      'SELECT id, google_sub FROM users WHERE email = $1 FOR UPDATE',
      [profile.email]
    );
    if (existingEmailUser.rowCount) {
      const user = existingEmailUser.rows[0];
      if (user.google_sub && user.google_sub !== profile.sub) {
        throw new Error('That email is already connected to a different Google account.');
      }
      const linked = await client.query(
        `UPDATE users SET google_sub = $1
         WHERE id = $2
         RETURNING id, name, email, created_at AS "createdAt"`,
        [profile.sub, user.id]
      );
      await client.query('COMMIT');
      return linked.rows[0];
    }

    const created = await client.query(
      `INSERT INTO users (id, name, email, google_sub)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, created_at AS "createdAt"`,
      [randomUUID(), profile.name, profile.email, profile.sub]
    );
    await client.query('COMMIT');
    return created.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  let databasePassword = process.env.PGPASSWORD;
  if (!databasePassword && process.env.DATABASE_URL) {
    try {
      databasePassword = new URL(process.env.DATABASE_URL).password;
    } catch {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    }
  }
  if (!process.env.SESSION_SECRET
    || process.env.SESSION_SECRET.length < 32
    || process.env.SESSION_SECRET === LOCAL_SESSION_SECRET
    || !databasePassword
    || databasePassword.length < 32
    || databasePassword === LOCAL_DATABASE_PASSWORD) {
    throw new Error('Production requires unique SESSION_SECRET and PostgreSQL credentials, each at least 32 characters; local development secrets are not allowed.');
  }
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

function createApp(pool, { fetchImpl = globalThis.fetch } = {}) {
  if (!pool) throw new Error('A PostgreSQL connection pool is required.');
  assertProductionConfig();

  const app = express();
  const PgSessionStore = connectPgSimple(session);
  const sessionStore = new PgSessionStore({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60
  });
  const sessionSecret = process.env.SESSION_SECRET || LOCAL_SESSION_SECRET;

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use(session({
    name: SESSION_COOKIE,
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS
    }
  }));

  app.use((request, response, next) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return next();
    const origin = request.get('origin');
    const fetchSite = request.get('sec-fetch-site');
    if (fetchSite === 'cross-site' || (origin && origin !== `${request.protocol}://${request.get('host')}`)) {
      return response.status(403).json({ error: 'Cross-site requests are not allowed.' });
    }
    next();
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === 'test' ? 100 : 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many account attempts. Please wait a few minutes and try again.' }
  });

  function requireUser(request, response, next) {
    if (!request.session.userId) {
      return response.status(401).json({ error: 'Please sign in to continue.' });
    }
    next();
  }

  function regenerateSession(request) {
    return new Promise((resolve, reject) => {
      request.session.regenerate((error) => (error ? reject(error) : resolve()));
    });
  }

  app.get('/api/health', async (_request, response, next) => {
    try {
      await pool.query('SELECT 1');
      response.json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/google', (request, response, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return response.status(503).send('Google sign-in is not configured.');
    }
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    request.session.googleOAuth = {
      state,
      verifier,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    request.session.save((error) => {
      if (error) return next(error);
      const authorizationUrl = new URL(GOOGLE_AUTHORIZE_URL);
      authorizationUrl.search = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: googleRedirectUri(),
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account'
      }).toString();
      response.redirect(authorizationUrl.toString());
    });
  });

  app.get('/api/auth/google/callback', async (request, response, next) => {
    const oauth = request.session.googleOAuth;
    delete request.session.googleOAuth;
    const fail = (message) => {
      request.session.oauthError = message;
      response.redirect('/');
    };

    if (request.query.error) return fail('Google sign-in was cancelled or denied.');
    if (!oauth || oauth.expiresAt < Date.now() || !safeEqual(oauth.state, request.query.state)) {
      return fail('Google sign-in expired or could not be verified. Please try again.');
    }
    if (typeof request.query.code !== 'string' || request.query.code.length > 2048) {
      return fail('Google did not provide a valid authorization code.');
    }

    try {
      const tokenResponse = await fetchImpl(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: request.query.code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: googleRedirectUri(),
          grant_type: 'authorization_code',
          code_verifier: oauth.verifier
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (!tokenResponse.ok) throw new Error('Google authorization code exchange failed.');
      const token = await tokenResponse.json();
      if (typeof token.access_token !== 'string' || token.token_type?.toLowerCase() !== 'bearer') {
        throw new Error('Google returned an invalid access token response.');
      }

      const profileResponse = await fetchImpl(GOOGLE_USERINFO_URL, {
        headers: { authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10000)
      });
      if (!profileResponse.ok) throw new Error('Google profile lookup failed.');
      const profile = await profileResponse.json();
      const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
      const name = typeof profile.name === 'string' ? profile.name.trim() : '';
      if (typeof profile.sub !== 'string' || !profile.sub || profile.sub.length > 255
        || profile.email_verified !== true
        || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || name.length < 2 || name.length > 60) {
        throw new Error('Google did not return a verified, usable account profile.');
      }

      const user = await findOrCreateGoogleUser(pool, { sub: profile.sub, email, name });
      await new Promise((resolve, reject) => {
        request.session.regenerate((error) => (error ? reject(error) : resolve()));
      });
      request.session.userId = user.id;
      await new Promise((resolve, reject) => {
        request.session.save((error) => (error ? reject(error) : resolve()));
      });
      response.redirect('/?signed_in=google');
    } catch (error) {
      console.error('Google sign-in failed:', error);
      fail('Google sign-in could not be completed. Please try again.');
    }
  });

  app.post('/api/auth/register', authLimiter, async (request, response, next) => {
    const { name, email, password } = request.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (cleanName.length < 2 || cleanName.length > 60) {
      return response.status(400).json({ error: 'Name must be between 2 and 60 characters.' });
    }
    if (cleanEmail.length > 254 || !emailPattern.test(cleanEmail)) {
      return response.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (typeof password !== 'string'
      || password.length < 12
      || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
      return response.status(400).json({ error: 'Password must be at least 12 characters and no more than 72 UTF-8 bytes.' });
    }

    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (id, name, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, created_at AS "createdAt"`,
        [randomUUID(), cleanName, cleanEmail, passwordHash]
      );
      await regenerateSession(request);
      request.session.userId = result.rows[0].id;
      response.status(201).json({ user: publicUser(result.rows[0]) });
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'users_email_key') {
        return response.status(409).json({ error: 'An account with that email already exists.' });
      }
      next(error);
    }
  });

  app.post('/api/auth/login', authLimiter, async (request, response, next) => {
    const { email, password } = request.body || {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string'
      || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
      return response.status(401).json({ error: 'Email or password is incorrect.' });
    }

    try {
      const result = await pool.query(
        `SELECT id, name, email, password_hash, created_at AS "createdAt"
         FROM users WHERE email = $1`,
        [email.trim().toLowerCase()]
      );
      const user = result.rows[0];
      const passwordMatches = user?.password_hash
        ? await bcrypt.compare(password, user.password_hash)
        : (await bcrypt.hash(password, 12), false);
      if (!user || !passwordMatches) {
        return response.status(401).json({ error: 'Email or password is incorrect.' });
      }

      await regenerateSession(request);
      request.session.userId = user.id;
      response.json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/me', async (request, response, next) => {
    if (!request.session.userId) {
      const oauthError = request.session.oauthError || null;
      delete request.session.oauthError;
      const result = { user: null };
      if (oauthError) result.oauthError = oauthError;
      return response.set('Cache-Control', 'no-store').json(result);
    }
    try {
      const result = await pool.query(
        `SELECT id, name, email, created_at AS "createdAt"
         FROM users WHERE id = $1`,
        [request.session.userId]
      );
      if (!result.rowCount) {
        request.session.destroy((error) => {
          if (error) return next(error);
          response.clearCookie(SESSION_COOKIE, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
          });
          response.json({ user: null });
        });
        return;
      }
      response.set('Cache-Control', 'no-store').json({ user: publicUser(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/logout', requireUser, (request, response, next) => {
    request.session.destroy((error) => {
      if (error) return next(error);
      response.clearCookie(SESSION_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      response.status(204).end();
    });
  });

  app.patch('/api/auth/profile', requireUser, async (request, response, next) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    if (name.length < 2 || name.length > 60) {
      return response.status(400).json({ error: 'Name must be between 2 and 60 characters.' });
    }
    try {
      const result = await pool.query(
        `UPDATE users SET name = $1
         WHERE id = $2
         RETURNING id, name, email, created_at AS "createdAt"`,
        [name, request.session.userId]
      );
      if (!result.rowCount) return response.status(401).json({ error: 'Please sign in to continue.' });
      response.json({ user: publicUser(result.rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/tasks', requireUser, async (request, response, next) => {
    try {
      const result = await pool.query(
        `SELECT id, title, completed, status, priority, tags, created_at AS "createdAt"
         FROM tasks WHERE user_id = $1
         ORDER BY created_at DESC, id DESC`,
        [request.session.userId]
      );
      response.set('Cache-Control', 'no-store').json(result.rows);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/tasks', requireUser, async (request, response, next) => {
    const title = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
    const priority = request.body?.priority === undefined ? 'medium' : request.body.priority;
    const tags = request.body?.tags === undefined ? [] : request.body.tags;
    if (!title || title.length > 200) {
      return response.status(400).json({ error: 'Task title must be between 1 and 200 characters.' });
    }
    if (typeof priority !== 'string' || !TASK_PRIORITIES.has(priority)) {
      return response.status(400).json({ error: 'Priority must be low, medium, high, or blocker.' });
    }
    if (!Array.isArray(tags)
      || tags.length > TASK_TAGS.size
      || tags.some((tag) => typeof tag !== 'string' || !TASK_TAGS.has(tag))
      || new Set(tags).size !== tags.length) {
      return response.status(400).json({ error: 'Choose up to six unique supported environment or topic tags.' });
    }
    try {
      const result = await pool.query(
        `INSERT INTO tasks (id, user_id, title, priority, tags)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, title, completed, status, priority, tags, created_at AS "createdAt"`,
        [randomUUID(), request.session.userId, title, priority, tags]
      );
      response.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/tasks/:id', requireUser, async (request, response, next) => {
    if (!UUID_PATTERN.test(request.params.id)) {
      return response.status(404).json({ error: 'Task not found.' });
    }
    const body = request.body || {};
    const hasStatus = Object.hasOwn(body, 'status');
    const hasCompleted = Object.hasOwn(body, 'completed');
    if (hasStatus && !TASK_STATUSES.has(body.status)) {
      return response.status(400).json({ error: 'Status must be todo, in_progress, review, or done.' });
    }
    if (hasCompleted && typeof body.completed !== 'boolean') {
      return response.status(400).json({ error: 'The completed field must be a boolean.' });
    }
    if (hasStatus && hasCompleted && body.completed !== (body.status === 'done')) {
      return response.status(400).json({ error: 'The completed field must agree with the status.' });
    }
    if (Object.hasOwn(body, 'priority')
      && (typeof body.priority !== 'string' || !TASK_PRIORITIES.has(body.priority))) {
      return response.status(400).json({ error: 'Priority must be low, medium, high, or blocker.' });
    }
    if (Object.hasOwn(body, 'tags')
      && (!Array.isArray(body.tags)
        || body.tags.length > TASK_TAGS.size
        || body.tags.some((tag) => typeof tag !== 'string' || !TASK_TAGS.has(tag))
        || new Set(body.tags).size !== body.tags.length)) {
      return response.status(400).json({ error: 'Choose up to six unique supported environment or topic tags.' });
    }

    const values = [];
    const updates = [];
    const addUpdate = (column, value) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };
    if (hasStatus || hasCompleted) {
      const status = hasStatus ? body.status : body.completed ? 'done' : 'todo';
      addUpdate('status', status);
      addUpdate('completed', status === 'done');
    }
    if (Object.hasOwn(body, 'priority')) addUpdate('priority', body.priority);
    if (Object.hasOwn(body, 'tags')) addUpdate('tags', body.tags);
    if (updates.length === 0) {
      return response.status(400).json({ error: 'Provide a status, completion state, priority, or tags to update.' });
    }

    try {
      values.push(request.params.id, request.session.userId);
      const result = await pool.query(
        `UPDATE tasks SET ${updates.join(', ')}
         WHERE id = $${values.length - 1} AND user_id = $${values.length}
         RETURNING id, title, completed, status, priority, tags, created_at AS "createdAt"`,
        values
      );
      if (!result.rowCount) return response.status(404).json({ error: 'Task not found.' });
      response.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/tasks/:id', requireUser, async (request, response, next) => {
    if (!UUID_PATTERN.test(request.params.id)) {
      return response.status(404).json({ error: 'Task not found.' });
    }
    try {
      const result = await pool.query(
        'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
        [request.params.id, request.session.userId]
      );
      if (!result.rowCount) return response.status(404).json({ error: 'Task not found.' });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(publicDirectory, { index: 'index.html' }));
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found.' });
  });

  app.use((error, _request, response, _next) => {
    if (response.headersSent) return;
    if (error instanceof SyntaxError && Object.hasOwn(error, 'body')) {
      return response.status(400).json({ error: 'Request body must be valid JSON.' });
    }
    if (error.type === 'entity.too.large') {
      return response.status(413).json({ error: 'Request body is too large.' });
    }
    console.error(error);
    response.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return app;
}

async function start() {
  const localEnvironmentFile = path.join(__dirname, '..', '.env.local');
  if (require('node:fs').existsSync(localEnvironmentFile)) {
    process.loadEnvFile(localEnvironmentFile);
  }
  assertProductionConfig();
  const pool = createPool();
  await initializeDatabase(pool);
  const app = createApp(pool);
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Task Manager is listening on port ${port}`);
  });

  const shutdown = () => {
    server.close(async (error) => {
      if (error) console.error('Error while closing HTTP server:', error);
      await pool.end();
      process.exit(error ? 1 : 0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start Task Manager:', error);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
