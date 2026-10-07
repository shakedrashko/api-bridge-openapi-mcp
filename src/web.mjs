import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { compileReadOnlyTools, invokeGet } from './adapter.mjs';
import { answerGoal, planToolCall } from './planner.mjs';

const spec = JSON.parse(await readFile(new URL('../demo/openapi.json', import.meta.url), 'utf8'));
const gitHubSpec = JSON.parse(await readFile(new URL('../demo/github-openapi.json', import.meta.url), 'utf8'));
const tools = [
  ...compileReadOnlyTools(spec, ['listPosts', 'getPost']).map((tool) => ({ ...tool, origin: 'https://jsonplaceholder.typicode.com', source: 'JSONPlaceholder' })),
  ...compileReadOnlyTools(gitHubSpec, ['getGitHubIssue']).map((tool) => ({ ...tool, origin: 'https://api.github.com', source: 'GitHub Issues' })),
];
const byName = new Map(tools.map((tool) => [tool.name, tool]));
const page = await readFile(new URL('../public/index.html', import.meta.url));
const css = await readFile(new URL('../public/style.css', import.meta.url));
const js = await readFile(new URL('../public/app.js', import.meta.url));
const port = Number(process.env.PORT || 4187);
const host = process.env.HOST || '127.0.0.1';

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', page);
    if (req.method === 'GET' && url.pathname === '/style.css') return send(res, 200, 'text/css; charset=utf-8', css);
    if (req.method === 'GET' && url.pathname === '/app.js') return send(res, 200, 'text/javascript; charset=utf-8', js);
    if (req.method === 'GET' && url.pathname === '/api/tools') {
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(tools.map(({ name, path, description, source, params }) => ({ name, path, description, source, params: params.map(({ name, location, type }) => ({ name, location, type })) }))));
    }
    if (req.method === 'GET' && url.pathname === '/api/cloud-status') {
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ available: Boolean(process.env.AGENT37_LLM_PROXY_URL && process.env.AGENT37_MANAGED_TOKEN) }));
    }
    if (req.method === 'POST' && (url.pathname === '/api/invoke' || url.pathname === '/api/agent')) {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) throw new Error('Request too large');
      }
      const request = JSON.parse(body);
      const plan = url.pathname === '/api/agent' ? await planToolCall(request.goal, tools) : null;
      const tool = plan?.tool || byName.get(request.name);
      if (!tool) throw new Error('Unknown or unapproved tool');
      const started = performance.now();
      const output = await invokeGet(tool, plan?.args || request.args || {}, tool.origin);
      const result = JSON.parse(output);
      const answer = plan ? await answerGoal(request.goal, tool.name, result) : null;
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ name: tool.name, args: plan?.args || request.args || {}, model: plan?.model || null, answer, durationMs: Math.round(performance.now() - started), result }));
    }
    send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  } catch (error) {
    send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ error: error.message }));
  }
});

server.listen(port, host, () => console.log(`API Bridge demo: http://${host}:${port}`));

