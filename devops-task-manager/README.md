# DevOps Task Manager

A polished, responsive task-management application with individual accounts and persistent PostgreSQL storage. It demonstrates version control, automated testing, Docker containerization, and a local deployment workflow.

## Features

- Create an account, sign in and out, and update your profile name.
- Sign in or register with Google OAuth using verified email, PKCE, and session-bound state.
- Add tasks, mark them complete, and delete them. Every task is scoped to its owner.
- Track Todo, In Progress, Review, and Done workflow states, plus Low, Medium, High, and Blocker priorities.
- Add `prod`, `staging`, `ci/cd`, `infra`, `docker`, and `db` tags; filter tasks by status, priority, or tag.
- Responsive dashboard with live search, status filters, sorting, completion statistics, a session theme toggle, and accessible feedback.
- Use `/` to jump to search, `n` or `c` to jump to quick add, and Escape to clear active filters. Export the current view as JSON or Markdown.
- Express REST API with input validation, login rate limits, password hashing, same-site sessions, and a database-backed health endpoint.
- PostgreSQL storage for accounts, sessions, and tasks. The app connects with a restricted database role, separate from the database administrator. Data remains available after the application restarts.
- Automated API integration tests using Node's built-in test runner and a real PostgreSQL database.
- Docker image build and Docker Compose deployment with a persistent database volume.
- GitHub Actions workflow that starts PostgreSQL, tests the app, builds the image, launches a container, and smoke-tests the service.

Passwords are hashed with bcrypt and never returned by the API. Sessions use HTTP-only, same-site cookies backed by PostgreSQL. This sample does not implement email verification or password reset, so deploy it publicly only after configuring strong secrets and HTTPS.

## Requirements

- Node.js 22 or newer and npm
- Docker Engine with the Docker Compose plugin
- Git and a GitHub repository for the hosted Actions workflow

## Run with Docker Compose (recommended)

The Compose stack runs both PostgreSQL and the application. On first startup, Compose creates a persistent `postgres_data` volume and the app initializes the database tables.

```sh
docker compose up --build -d
docker compose ps
```

Open <http://localhost:3000>, create an account, and add a task. Your account and tasks remain in the PostgreSQL volume if the app container is rebuilt. Stop the services but keep the data with:

```powershell
docker compose down
```

To also permanently remove the local database volume and its data:

```powershell
docker compose down --volumes
```

The Compose defaults are for local development only. Before a public deployment, copy `.env.example` to `.env`, set unique long random values for `POSTGRES_PASSWORD`, `TASKFLOW_APP_PASSWORD`, and `SESSION_SECRET`, set `NODE_ENV=production`, and use HTTPS. The production server rejects the built-in local credentials, requires a session secret of at least 32 characters, and sends secure cookies. If HTTPS terminates at a trusted reverse proxy, set `TRUST_PROXY=1`.

### Google sign-in

Create a Google OAuth 2.0 web client and add this exact authorized redirect URI:
`http://localhost:3000/api/auth/google/callback`. Put `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in the ignored `.env.local`
file. `npm start` loads this file automatically, and Docker Compose passes its
values to the app container when the file exists. The default redirect URI is
the localhost value shown above; production deployments must set the deployed
HTTPS callback URI and keep the client secret out of source control.

## Run tests locally

Start the database service first:

```sh
docker compose up -d database
npm ci
npm test
```

The database must be available on `localhost:5432` with the local app-role credentials in `compose.yaml`. Compose initializes a separate `taskflow_test` database for the test suite, so `npm test` never changes the app's `taskflow` database. Stop the database with `docker compose down` when finished. Test accounts and tasks are cleared from the test database between tests.

## Run the Node server directly

Start PostgreSQL with `docker compose up -d database`, then run `npm ci` and `npm start`. Open <http://localhost:3000>. Set the `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` environment variables if your local database uses different connection settings.

## GitHub Actions pipeline

The workflow at the repository root, `.github/workflows/ci.yml`, runs for pushes and pull requests targeting `main`:

1. Checks out the source and installs the locked Node.js dependencies.
2. Starts a PostgreSQL service and runs account, session, authorization, and task integration tests.
3. Builds the Docker image.
4. Starts the image on the runner and smoke-tests the database-backed health endpoint and frontend.

To use the hosted pipeline, push the repository to its `main` branch and open the **Actions** tab. The container deployment in CI is a temporary smoke-test deployment on the runner; use Docker Compose for the local demonstration deployment.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Application and database health check |
| `POST` | `/api/auth/register` | Create an account with `{ "name", "email", "password" }` |
| `POST` | `/api/auth/login` | Sign in with `{ "email", "password" }` |
| `GET` | `/api/auth/google` | Start Google OAuth sign-in or registration |
| `GET` | `/api/auth/google/callback` | Validate Google's response and establish the app session |
| `GET` | `/api/auth/me` | Read the current session profile |
| `POST` | `/api/auth/logout` | End the current session |
| `PATCH` | `/api/auth/profile` | Update the profile name with `{ "name": "..." }` |
| `GET` | `/api/tasks` | List only the signed-in user's tasks |
| `POST` | `/api/tasks` | Create a task with `{ "title": "...", "priority": "high", "tags": ["docker"] }` |
| `PATCH` | `/api/tasks/:id` | Update `status`, `priority`, or `tags`; legacy `{ "completed": true }` requests remain supported |
| `DELETE` | `/api/tasks/:id` | Delete a task owned by the signed-in user |

Account and task endpoints except registration and login require the server-issued session cookie. Passwords must contain at least 12 characters and fit within 72 UTF-8 bytes. Names must contain 2–60 characters; task titles are limited to 200 characters. Priority values are `low`, `medium`, `high`, and `blocker`; task statuses are `todo`, `in_progress`, `review`, and `done`. The allowed tags are `prod`, `staging`, `ci/cd`, `infra`, `docker`, and `db`. Task operations use parameterized SQL and include the authenticated user ID in reads and writes.

## Submission evidence

See [PROJECT_REPORT.md](./PROJECT_REPORT.md) for the report outline, repository-link field, and screenshot checklist to complete for evaluation.
