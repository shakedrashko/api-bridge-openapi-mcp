const toolList = document.querySelector('#tool-list');
const toolSelect = document.querySelector('#tool-select');
const paramFields = document.querySelector('#param-fields');
const form = document.querySelector('#run-form');
const button = document.querySelector('#run-button');
const status = document.querySelector('#request-status');
const result = document.querySelector('#result code');
let tools = [];

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
    input.value = ({ id: '2', number: '1', owner: 'nodejs', repo: 'node', userId: '1' })[param.name] || '';
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
    const response = await fetch('/api/tools');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    tools = await response.json();
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
    const response = await fetch('/api/invoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: toolSelect.value, args }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
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

fetch('/api/cloud-status').then((response) => response.json()).then(({ available }) => {
  agentState.textContent = available ? 'Agent37 ready' : 'Cloud setup pending';
  agentButton.disabled = !available;
}).catch(() => {
  agentState.textContent = 'Cloud status unavailable';
  agentButton.disabled = true;
});

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

