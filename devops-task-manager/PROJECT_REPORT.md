# DevOps Mini-Project Report

## Project details

- **Project title:** DevOps Task Manager
- **Student name:** _Fill in_
- **Course / semester:** _Fill in_
- **GitHub repository:** https://github.com/kaushiksurve/devops-task-manager

## Objective

Develop a small web application and demonstrate an end-to-end development workflow using Git, GitHub, GitHub Actions, automated tests, Docker, and Docker Compose.

## Application overview

The application is a responsive task-management dashboard with a browser-based interface and a Node.js HTTP API. Users can add tasks, search, filter and sort the list, mark tasks complete, and delete them. The API validates task titles, records task creation timestamps, and provides a health endpoint. Task data is held in memory and is reset when the process restarts; persistent storage is outside this mini-project's scope.

## Architecture and tools

| Area | Implementation |
| --- | --- |
| Frontend | HTML, CSS, and browser JavaScript in `public/` |
| Backend | Node.js HTTP server and JSON API in `src/server.js` |
| Version control | Git repository; publish to GitHub and use the `main` branch |
| Automated tests | Node.js built-in test runner with HTTP integration tests |
| Continuous integration | GitHub Actions in the repository-root `.github/workflows/ci.yml` |
| Containerization | `Dockerfile`, based on Node.js 22 Alpine |
| Local deployment | `compose.yaml`, available at `http://localhost:3000` |

## Pipeline

On a push or pull request targeting `main`, GitHub Actions checks out the code, installs dependencies from the lockfile, runs the test suite, and builds the Docker image. It then starts a container on the Actions runner and checks the health endpoint and frontend response. The runner deployment is temporary and is removed at the end of the job. For the live classroom demonstration on a local machine, Docker Compose builds and runs the app.

## Verification steps

Run these commands from the project directory:

```powershell
npm ci
npm test
docker compose up --build -d
docker compose ps
```

Open `http://localhost:3000`, add a task, mark it complete, and delete it. Verify `http://localhost:3000/api/health` returns `{"status":"ok"}`. Clean up with:

```powershell
docker compose down
```

## Screenshot checklist

Capture and insert genuine screenshots before submission. Suggested evidence:

1. The running task manager in a browser, showing a task being added and completed.
2. A successful `npm test` run.
3. `docker compose ps` showing the app container healthy.
4. The GitHub Actions run showing the test, image build, and container smoke-check steps passing.
5. The GitHub repository page with the source and configuration files.

## Conclusion

The project demonstrates source control, repeatable automated testing, container image creation, and container deployment. The GitHub Actions workflow provides continuous integration and validates the containerized app; Docker Compose provides a repeatable local deployment for evaluation.
