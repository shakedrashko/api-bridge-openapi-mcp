import { z } from 'zod';

const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_RESPONSE_BYTES = 200_000;

function scalarParameter(parameter) {
  if (!PARAM_NAME.test(parameter.name || '')) return null;
  if (!['path', 'query'].includes(parameter.in)) return null;
  const schema = parameter.schema || {};
  let validator;
  if (schema.type === 'integer') validator = z.number().int();
  else if (schema.type === 'number') validator = z.number().finite();
  else if (schema.type === 'boolean') validator = z.boolean();
  else if (schema.type === 'string' || !schema.type) validator = z.string().max(300);
  else return null;
  return {
    name: parameter.name,
    location: parameter.in,
    type: schema.type || 'string',
    schema: parameter.required || parameter.in === 'path' ? validator : validator.optional(),
  };
}

export function compileReadOnlyTools(spec, approvedOperations) {
  if (!spec || typeof spec !== 'object' || typeof spec.paths !== 'object') {
    throw new Error('OpenAPI paths are required');
  }
  const tools = [];
  const names = new Set();
  for (const [path, item] of Object.entries(spec.paths)) {
    if (!path.startsWith('/') || !item || typeof item !== 'object') continue;
    const operation = item.get;
    if (!operation || typeof operation !== 'object') continue;
    const name = operation.operationId;
    if (!TOOL_NAME.test(name || '') || !approvedOperations.includes(name)) continue;
    if (names.has(name)) throw new Error(`Duplicate operationId: ${name}`);
    names.add(name);
    if (operation.requestBody || operation.security?.length || spec.security?.length) continue;
    const all = [...(item.parameters || []), ...(operation.parameters || [])];
    if (all.some((p) => !p || '$ref' in p)) continue;
    const params = all.map(scalarParameter);
    if (params.some((p) => !p)) continue;
    const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (placeholders.some((p) => !params.some((q) => q.name === p && q.location === 'path'))) continue;
    const shape = Object.fromEntries(params.map((p) => [p.name, p.schema]));
    tools.push({ name, path, description: String(operation.summary || operation.description || name).slice(0, 500), params, inputSchema: z.object(shape) });
  }
  return tools;
}

export async function invokeGet(tool, args, origin, fetcher = fetch) {
  const parsed = tool.inputSchema.parse(args);
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('A trusted HTTPS API origin is required');
  }
  let path = tool.path;
  for (const param of tool.params.filter((p) => p.location === 'path')) {
    path = path.replace(`{${param.name}}`, encodeURIComponent(String(parsed[param.name])));
  }
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error('Operation escaped API origin');
  for (const param of tool.params.filter((p) => p.location === 'query')) {
    if (parsed[param.name] !== undefined) url.searchParams.set(param.name, String(parsed[param.name]));
  }
  const response = await fetcher(url, {
    method: 'GET',
    headers: { accept: 'application/json', 'user-agent': 'API-Bridge-Demo/0.1' },
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('Response exceeds size limit');
  }
  const chunks = [];
  let length = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_RESPONSE_BYTES) throw new Error('Response exceeds size limit');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
  const body = Buffer.concat(chunks, length).toString('utf8');
  if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  return body;
}

