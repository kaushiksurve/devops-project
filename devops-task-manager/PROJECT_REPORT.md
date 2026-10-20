# DevOps Mini-Project Report

## Project details

- **Project title:** DevOps Task Manager
- **Student name:** _Fill in_
- **Course / semester:** _Fill in_
- **GitHub repository:** https://github.com/kaushiksurve/devops-project

## Objective

Develop a small web application and demonstrate an end-to-end development workflow using Git, GitHub, GitHub Actions, automated tests, Docker, and Docker Compose.

## Application overview

The application is a responsive task-management dashboard with registration, sign-in, profile editing, and an Express API. Users can add tasks with a priority and environment/topic tags, move them through Todo, In Progress, Review, and Done, search, filter, sort, and export the task list. PostgreSQL stores account profiles, sessions, and user-owned task metadata so the data persists across application restarts.

## Architecture and tools

| Area | Implementation |
| --- | --- |
| Frontend | HTML, CSS, and browser JavaScript in `public/` |
| Backend | Express JSON API in `src/server.js` |
| Authentication | Password sign-in and Google OAuth (verified email, PKCE, session-bound state) with HTTP-only PostgreSQL-backed sessions |
| Database | PostgreSQL users, sessions, and user-owned tasks in `src/db.js` |
| Version control | Git repository; publish to GitHub and use the `main` branch |
| Automated tests | Node.js built-in test runner with HTTP integration tests |
| Continuous integration | GitHub Actions in the repository-root `.github/workflows/ci.yml` |
| Containerization | `Dockerfile`, based on Node.js 22 Alpine |
| Local deployment | PostgreSQL + application in `compose.yaml`, available at `http://localhost:3000` |

Supported priority values are Low, Medium, High, and Blocker. Supported tags are `prod`, `staging`, `ci/cd`, `infra`, `docker`, and `db`. JSON and Markdown exports include the current filtered task view.

## Pipeline

On a push or pull request targeting `main`, GitHub Actions checks out the code, installs dependencies from the lockfile, runs the test suite, and builds the Docker image. It then starts a container on the Actions runner and checks the health endpoint and frontend response. The runner deployment is temporary and is removed at the end of the job. For the live classroom demonstration on a local machine, Docker Compose builds and runs the app.

## Verification steps

Run these commands from the project directory:

```sh
docker compose up --build -d
docker compose ps
```

Create an account at `http://localhost:3000`, add a task, mark it complete, and delete it. Create a second account and verify it cannot see the first account's tasks. Verify `http://localhost:3000/api/health` returns `{"status":"ok"}`. For automated tests run `npm ci` and `npm test` while the Compose database is running. The test suite uses the separate `taskflow_test` database. Clean up the application and database container while retaining the local database volume with:

```sh
docker compose down
```

Local Compose credentials are for development only. Configure unique database and session secrets, HTTPS, and production environment settings before deploying publicly.

## Screenshot checklist

Capture and insert genuine screenshots before submission. Suggested evidence:

1. The running task manager in a browser, showing a task being added and completed.
2. A successful `npm test` run.
3. `docker compose ps` showing the app container healthy.
4. The GitHub Actions run showing the test, image build, and container smoke-check steps passing.
5. The GitHub repository page with the source and configuration files.

## Conclusion

The project demonstrates source control, repeatable automated testing, account authentication, per-user data isolation, persistent PostgreSQL storage, container image creation, and container deployment. The GitHub Actions workflow validates the API against a PostgreSQL service and smoke-tests the container; Docker Compose provides a repeatable local deployment for evaluation.
