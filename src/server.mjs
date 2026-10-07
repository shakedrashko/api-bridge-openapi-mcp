import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { compileReadOnlyTools, invokeGet } from './adapter.mjs';

export function createCatalogServer(configs, fetcher) {
  const server = new McpServer({ name: 'api-to-mcp-readonly-demo', version: '0.1.0' });
  const catalog = configs.flatMap(({ spec, origin, approvedOperations }) => compileReadOnlyTools(spec, approvedOperations).map((tool) => ({ tool, origin })));
  const names = catalog.map(({ tool }) => tool.name);
  if (new Set(names).size !== names.length) throw new Error('Duplicate approved tool name across API sources');
  for (const { tool, origin } of catalog) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    }, async (args) => {
      try {
        return { content: [{ type: 'text', text: await invokeGet(tool, args, origin, fetcher) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    });
  }
  return { server, toolNames: names };
}

export function createServer(spec, origin, approvedOperations, fetcher) {
  return createCatalogServer([{ spec, origin, approvedOperations }], fetcher);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  const specFile = process.env.OPENAPI_SPEC_FILE;
  const origin = process.env.TRUSTED_API_ORIGIN;
  const operations = process.env.APPROVED_GET_OPERATIONS?.split(',').map((x) => x.trim()).filter(Boolean) || [];
  const custom = Boolean(specFile || origin || operations.length);
  if (custom && (!specFile || !origin || operations.length === 0)) {
    throw new Error('Set OPENAPI_SPEC_FILE, TRUSTED_API_ORIGIN, and APPROVED_GET_OPERATIONS together');
  }
  const configs = custom ? [{ spec: JSON.parse(await readFile(specFile, 'utf8')), origin, approvedOperations: operations }] : [
    { spec: JSON.parse(await readFile(new URL('../demo/openapi.json', import.meta.url), 'utf8')), origin: 'https://jsonplaceholder.typicode.com', approvedOperations: ['listPosts', 'getPost'] },
    { spec: JSON.parse(await readFile(new URL('../demo/github-openapi.json', import.meta.url), 'utf8')), origin: 'https://api.github.com', approvedOperations: ['getGitHubIssue'] },
  ];
  const { server, toolNames } = createCatalogServer(configs);
  if (toolNames.length === 0) throw new Error('No approved safe GET operations found');
  await server.connect(new StdioServerTransport());
  console.error(`Ready: ${toolNames.join(', ')}`);
}

