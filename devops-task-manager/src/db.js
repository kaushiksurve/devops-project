const { Pool } = require('pg');

function createPool() {
  return new Pool({
    ...(process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.PGHOST || 'localhost',
          port: Number(process.env.PGPORT) || 5432,
          database: process.env.NODE_ENV === 'test'
            ? process.env.TEST_PGDATABASE || 'taskflow_test'
            : process.env.PGDATABASE || 'taskflow',
          user: process.env.PGUSER || 'taskflow_app',
          password: process.env.PGPASSWORD || 'taskflow-app-local-only'
        }),
    max: process.env.NETLIFY ? 3 : 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
  });
}

async function initializeDatabase(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name VARCHAR(60) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT,
      google_sub TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_idx ON users (google_sub)
      WHERE google_sub IS NOT NULL;

    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      tags TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'todo';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

    UPDATE tasks
    SET status = CASE WHEN completed THEN 'done' ELSE 'todo' END
    WHERE status = 'todo' AND completed = TRUE;

    DO $$
    BEGIN
      ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
        CHECK (status IN ('todo', 'in_progress', 'review', 'done'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$
    BEGIN
      ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
        CHECK (priority IN ('low', 'medium', 'high', 'blocker'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$
    BEGIN
      ALTER TABLE tasks ADD CONSTRAINT tasks_tags_check
        CHECK (
          cardinality(tags) <= 6
          AND tags <@ ARRAY['prod', 'staging', 'ci/cd', 'infra', 'docker', 'db']::TEXT[]
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE INDEX IF NOT EXISTS tasks_user_created_idx
      ON tasks (user_id, created_at DESC, id DESC);
  `);
}

module.exports = { createPool, initializeDatabase };
