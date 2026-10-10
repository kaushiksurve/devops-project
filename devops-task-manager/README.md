# DevOps Task Manager

A polished, responsive task-management dashboard built as a mini project for demonstrating version control, automated testing, Docker containerization, and a local deployment workflow.

## Features

- Add tasks, mark them complete, and delete them.
- Responsive dashboard with live search, status filters, sorting, completion statistics, a session theme toggle, and accessible feedback.
- Node.js HTTP API with input validation, creation timestamps, and a health endpoint.
- Automated API and frontend-serving tests using Node's built-in test runner.
- Docker image build and Docker Compose deployment.
- GitHub Actions workflow that tests the app, builds the image, launches a container, and smoke-tests the deployed service.

Tasks are stored in memory for this demonstration and are reset when the server restarts.

## Requirements

- Node.js 22 or newer and npm
- Docker Engine with the Docker Compose plugin
- Git and a GitHub repository for the hosted Actions workflow

## Run locally

```powershell
npm ci
npm test
npm start
```

Open <http://localhost:3000>. To stop the server, press `Ctrl+C`.

## Deploy with Docker Compose

From the project directory:

```powershell
docker compose up --build -d
docker compose ps
```

Open <http://localhost:3000>. Confirm the container is healthy with `docker compose ps` or check <http://localhost:3000/api/health>. Stop and remove the deployment with:

```powershell
docker compose down
```

## GitHub Actions pipeline

The workflow at the repository root, `.github/workflows/ci.yml`, runs for pushes and pull requests targeting `main`:

1. Checks out the source and installs the locked Node.js dependencies.
2. Runs the automated test suite.
3. Builds the Docker image.
4. Starts the image as a container on the Actions runner and smoke-tests its health endpoint and frontend.

To use the hosted pipeline, push the repository to its `main` branch and open the **Actions** tab. The container deployment in CI is a temporary smoke-test deployment on the runner; use Docker Compose for the local demonstration deployment.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Container health check |
| `GET` | `/api/tasks` | List tasks |
| `POST` | `/api/tasks` | Create a task with `{ "title": "..." }` |
| `PATCH` | `/api/tasks/:id` | Set completion with `{ "completed": true }` |
| `DELETE` | `/api/tasks/:id` | Delete a task |

## Submission evidence

See [PROJECT_REPORT.md](./PROJECT_REPORT.md) for the report outline, repository-link field, and screenshot checklist to complete for evaluation.
