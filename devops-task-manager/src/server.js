const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const publicDirectory = path.join(__dirname, '..', 'public');
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']]
]);

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(data));
}

function sendRequestError(response, error) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (statusCode === 500) {
    console.error(error);
  }
  sendJson(response, statusCode, {
    error: statusCode === 500 ? 'Internal server error.' : error.message
  });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw httpError(413, 'Request body is too large.');
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'Request body must be valid JSON.');
  }
}

function createServer() {
  const tasks = [];

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const { pathname } = url;

    if (pathname === '/api/health' && request.method === 'GET') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/api/tasks' && request.method === 'GET') {
      sendJson(response, 200, tasks);
      return;
    }

    if (pathname === '/api/tasks' && request.method === 'POST') {
      try {
        const body = await readJson(request);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        if (!title || title.length > 200) {
          sendJson(response, 400, { error: 'Task title must be between 1 and 200 characters.' });
          return;
        }

        const task = {
          id: randomUUID(),
          title,
          completed: false,
          createdAt: new Date().toISOString()
        };
        tasks.push(task);
        sendJson(response, 201, task);
      } catch (error) {
        sendRequestError(response, error);
      }
      return;
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/([0-9a-f-]+)$/i);
    if (taskMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
      const index = tasks.findIndex((task) => task.id === taskMatch[1]);
      if (index === -1) {
        sendJson(response, 404, { error: 'Task not found.' });
        return;
      }

      if (request.method === 'DELETE') {
        tasks.splice(index, 1);
        response.writeHead(204);
        response.end();
        return;
      }

      try {
        const body = await readJson(request);
        if (typeof body?.completed !== 'boolean') {
          sendJson(response, 400, { error: 'The completed field must be a boolean.' });
          return;
        }

        tasks[index].completed = body.completed;
        sendJson(response, 200, tasks[index]);
      } catch (error) {
        sendRequestError(response, error);
      }
      return;
    }

    if (request.method === 'GET' && staticFiles.has(pathname)) {
      const [fileName, contentType] = staticFiles.get(pathname);
      const content = fs.readFileSync(path.join(publicDirectory, fileName));
      response.writeHead(200, { 'content-type': contentType });
      response.end(content);
      return;
    }

    sendJson(response, 404, { error: 'Not found.' });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Task Manager is listening on port ${port}`);
  });
}

module.exports = { createServer };
