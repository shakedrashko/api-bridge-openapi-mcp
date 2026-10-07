const toolList = document.querySelector('#tool-list');
const toolSelect = document.querySelector('#tool-select');
const paramFields = document.querySelector('#param-fields');
const form = document.querySelector('#run-form');
const button = document.querySelector('#run-button');
const status = document.querySelector('#request-status');
const result = document.querySelector('#result code');
let tools = [];
const staticPreview = location.hostname.endsWith('.github.io') || new URLSearchParams(location.search).has('static');
const staticTools = [
  { name: 'listPosts', path: '/posts', description: 'List public example posts', source: 'JSONPlaceholder', params: [{ name: 'userId', location: 'query', type: 'integer' }] },
  { name: 'getPost', path: '/posts/{id}', description: 'Get one public example post', source: 'JSONPlaceholder', params: [{ name: 'id', location: 'path', type: 'integer' }] },
  { name: 'getGitHubIssue', path: '/repos/{owner}/{repo}/issues/{number}', description: 'Fetch one public GitHub issue or pull request by owner, repository, and number', source: 'GitHub Issues', params: [{ name: 'owner', location: 'path', type: 'string' }, { name: 'repo', location: 'path', type: 'string' }, { name: 'number', location: 'path', type: 'integer' }] },
];

async function invokeStatic(name, args) {
  let url;
  if (name === 'listPosts') {
    url = new URL('https://jsonplaceholder.typicode.com/posts');
    if (args.userId !== undefined) {
      if (!Number.isSafeInteger(args.userId) || args.userId < 1) throw new Error('userId must be a positive integer');
      url.searchParams.set('userId', String(args.userId));
    }
  } else if (name === 'getPost') {
    if (!Number.isSafeInteger(args.id) || args.id < 1) throw new Error('id must be a positive integer');
    url = new URL(`https://jsonplaceholder.typicode.com/posts/${args.id}`);
  } else if (name === 'getGitHubIssue') {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(args.owner || '') || !/^[A-Za-z0-9._-]{1,100}$/.test(args.repo || '') || !Number.isSafeInteger(args.number) || args.number < 1) throw new Error('Enter a valid repository and positive issue number');
    url = new URL(`https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/issues/${args.number}`);
  } else {
    throw new Error('Unknown or unapproved tool');
  }
  const started = performance.now();
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Public API returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 200_000) { await reader.cancel(); throw new Error('Public API response exceeded 200 KB'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return { name, result: JSON.parse(new TextDecoder().decode(bytes)), durationMs: Math.round(performance.now() - started) };
}

function displayResult(name, value) {
  if (name === 'getGitHubIssue') {
    return { repository: value.repository_url?.replace('https://api.github.com/repos/', ''), number: value.number, title: value.title, state: value.state, comments: value.comments, url: value.html_url, body: value.body?.slice(0, 500) || '' };
  }
  return value;
}

function renderParams() {
  const tool = tools.find((item) => item.name === toolSelect.value);
  paramFields.replaceChildren();
  if (!tool) return;
  for (const param of tool.params) {
    const label = document.createElement('label');
    label.htmlFor = `param-${param.name}`;
    label.textContent = `${param.name} (${param.location})`;
    const input = document.createElement('input');
    input.id = `param-${param.name}`;
    input.name = param.name;
    input.type = param.type === 'integer' || param.type === 'number' ? 'number' : 'text';
    if (input.type === 'number') input.step = param.type === 'integer' ? '1' : 'any';
    input.value = ({ id: '2', number: '66560', owner: 'nodejs', repo: 'node', userId: '1' })[param.name] || '';
    input.required = param.location === 'path';
    paramFields.append(label, input);
  }
  if (tool.params.length === 0) {
    const note = document.createElement('p');
    note.className = 'field-note';
    note.textContent = 'This operation has no parameters.';
    paramFields.append(note);
  }
}

async function loadTools() {
  try {
    if (staticPreview) {
      tools = staticTools;
    } else {
      const response = await fetch('/api/tools');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      tools = await response.json();
    }
    document.querySelector('#tool-count').textContent = `${tools.length} tools`;
    for (const tool of tools) {
      const card = document.createElement('div');
      card.className = 'tool-card';
      card.setAttribute('role', 'listitem');
      const line = document.createElement('div');
      line.className = 'tool-path';
      const method = document.createElement('span');
      method.className = 'method';
      method.textContent = 'GET';
      const path = document.createElement('code');
      path.textContent = tool.path;
      const description = document.createElement('p');
      description.textContent = `${tool.description} · ${tool.source}`;
      line.append(method, path);
      card.append(line, description);
      toolList.append(card);
      const option = document.createElement('option');
      option.value = tool.name;
      option.textContent = `${tool.name}  -  GET ${tool.path}`;
      toolSelect.append(option);
    }
    toolSelect.value = 'getGitHubIssue';
    renderParams();
  } catch (error) {
    status.textContent = 'Unable to load tools';
    result.textContent = error.message;
  }
}

toolSelect.addEventListener('change', renderParams);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const args = {};
  for (const input of paramFields.querySelectorAll('input')) {
    if (input.value !== '') args[input.name] = input.type === 'number' ? Number(input.value) : input.value;
  }
  button.disabled = true;
  status.textContent = 'Running...';
  result.textContent = 'Waiting for the public API';
  try {
    let payload;
    if (staticPreview) {
      payload = await invokeStatic(toolSelect.value, args);
    } else {
      const response = await fetch('/api/invoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: toolSelect.value, args }),
      });
      payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    }
    result.textContent = JSON.stringify(displayResult(payload.name, payload.result), null, 2);
    status.textContent = `HTTP 200  -  ${payload.durationMs} ms`;
  } catch (error) {
    status.textContent = 'Request failed';
    result.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

loadTools();

const agentForm = document.querySelector('#agent-form');
const agentButton = document.querySelector('#agent-button');
const agentState = document.querySelector('#cloud-state');
const agentStatus = document.querySelector('#agent-status');
const agentResult = document.querySelector('#agent-result code');

if (staticPreview) {
  agentState.textContent = 'Agent mode on hosted demo';
  const hostedDemoLink = document.createElement('a');
  hostedDemoLink.href = 'https://api-bridge-xztr0jc7pn.agent37.app/';
  hostedDemoLink.textContent = 'Open hosted Agent37 demo';
  hostedDemoLink.target = '_blank';
  hostedDemoLink.rel = 'noopener noreferrer';
  document.querySelector('.agent-panel .section-note').replaceChildren(
    'This preview runs manual tools and exports MCP configurations. ',
    hostedDemoLink,
    ' to plan and run an agent request.',
  );
  agentStatus.textContent = 'Use hosted demo';
  agentResult.textContent = 'Open the hosted demo to see an agent plan and verified API response.';
  agentButton.disabled = true;
} else {
  fetch('/api/cloud-status').then((response) => response.json()).then(({ available }) => {
    agentState.textContent = available ? 'Agent37 ready' : 'Cloud setup pending';
    agentButton.disabled = !available;
  }).catch(() => {
    agentState.textContent = 'Cloud status unavailable';
    agentButton.disabled = true;
  });
}

agentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  agentButton.disabled = true;
  agentStatus.textContent = 'Planning and running...';
  agentResult.textContent = 'Agent37 is selecting an approved tool.';
  try {
    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: document.querySelector('#agent-goal').value }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    agentResult.textContent = JSON.stringify({ answer: payload.answer, plan: { tool: payload.name, args: payload.args, model: payload.model }, verifiedResponse: displayResult(payload.name, payload.result) }, null, 2);
    agentStatus.textContent = 'Plan verified · HTTP 200';
  } catch (error) {
    agentStatus.textContent = 'Agent run failed';
    agentResult.textContent = error.message;
  } finally {
    agentButton.disabled = false;
  }
});

const specFile = document.querySelector('#spec-file');
const originInput = document.querySelector('#trusted-origin');
const operationList = document.querySelector('#import-operations');
const importForm = document.querySelector('#import-form');
const importStatus = document.querySelector('#import-status');
let importedSpec = null;

specFile.addEventListener('change', async () => {
  importedSpec = null;
  operationList.replaceChildren();
  const file = specFile.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Choose an OpenAPI JSON file under 1 MB');
    const spec = JSON.parse(await file.text());
    if (!spec || typeof spec.paths !== 'object') throw new Error('The file has no OpenAPI paths');
    const candidates = [];
    const seen = new Set();
    for (const [path, methods] of Object.entries(spec.paths)) {
      const operation = methods?.get;
      const name = operation?.operationId;
      if (!path.startsWith('/') || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name || '') || seen.has(name)) continue;
      seen.add(name);
      if (operation.requestBody || operation.security?.length || spec.security?.length) continue;
      const params = [...(methods.parameters || []), ...(operation.parameters || [])];
      if (params.some((p) => !p || p.$ref || !['path', 'query'].includes(p.in) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(p.name || '') || ![undefined, 'string', 'integer', 'number', 'boolean'].includes(p.schema?.type))) continue;
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      if (placeholders.some((part) => !params.some((p) => p.in === 'path' && p.name === part))) continue;
      candidates.push({ name, path });
    }
    if (candidates.length === 0) throw new Error('No supported unauthenticated GET operations found');
    importedSpec = spec;
    for (const item of candidates) {
      const label = document.createElement('label');
      label.className = 'operation-choice';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = item.name;
      const text = document.createElement('span');
      text.textContent = `GET ${item.path}  ·  ${item.name}`;
      label.append(checkbox, text);
      operationList.append(label);
    }
    const serverUrl = spec.servers?.[0]?.url;
    if (serverUrl) {
      const parsed = new URL(serverUrl);
      if (parsed.protocol === 'https:') originInput.value = parsed.origin;
    }
    importStatus.textContent = `${candidates.length} candidate GET operation(s). Select only those you approve.`;
  } catch (error) {
    const note = document.createElement('p');
    note.className = 'field-note';
    note.textContent = error.message;
    operationList.append(note);
    importStatus.textContent = 'Import failed';
  }
});

importForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    if (!importedSpec) throw new Error('Choose an OpenAPI JSON file first');
    const approvedOperations = [...operationList.querySelectorAll('input:checked')].map((input) => input.value);
    if (approvedOperations.length === 0) throw new Error('Approve at least one operation');
    const origin = new URL(originInput.value);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
      throw new Error('Enter an HTTPS origin without a path, query, or credentials');
    }
    const config = { spec: importedSpec, origin: origin.origin, approvedOperations };
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }));
    link.href = objectUrl;
    link.download = 'api-bridge.config.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    importStatus.textContent = `Downloaded configuration for ${approvedOperations.length} approved operation(s). Set BRIDGE_CONFIG_FILE to the downloaded path and run npm start.`;
  } catch (error) {
    importStatus.textContent = error.message;
  }
});

