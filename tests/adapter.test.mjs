import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { compileReadOnlyTools, invokeGet } from '../src/adapter.mjs';
import { createServer } from '../src/server.mjs';

const spec = JSON.parse(await readFile(new URL('../demo/openapi.json', import.meta.url), 'utf8'));

test('only allowlisted GET operations become tools', () => {
  const tools = compileReadOnlyTools(spec, ['listPosts', 'getPost', 'deletePost']);
  assert.deepEqual(tools.map((tool) => tool.name), ['listPosts', 'getPost']);
});

test('encodes parameters, bounds upstream data, and never redirects', async () => {
  const tool = compileReadOnlyTools(spec, ['getPost'])[0];
  let observed;
  const data = await invokeGet(tool, { id: 7 }, 'https://jsonplaceholder.typicode.com', async (url, options) => {
    observed = { url: String(url), options };
    return new Response('{"id":7}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.equal(data, '{"id":7}');
  assert.equal(observed.url, 'https://jsonplaceholder.typicode.com/posts/7');
  assert.equal(observed.options.method, 'GET');
  assert.equal(observed.options.redirect, 'error');
  await assert.rejects(() => invokeGet(tool, { id: 7 }, 'http://localhost', fetch), /trusted HTTPS/);
  await assert.rejects(() => invokeGet(tool, { id: 7 }, 'https://jsonplaceholder.typicode.com', async () => new Response('x', { headers: { 'content-length': '200001' } })), /size limit/);
  await assert.rejects(() => invokeGet(tool, { id: 7 }, 'https://jsonplaceholder.typicode.com', async () => new Response('x'.repeat(200_001))), /size limit/);
});

test('MCP client can discover and call an approved tool', async () => {
  const { server } = createServer(spec, 'https://jsonplaceholder.typicode.com', ['getPost'], async () => new Response('{"id":2}', { status: 200 }));
  const client = new Client({ name: 'demo-test-client', version: '0.1.0' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), ['getPost']);
    const result = await client.callTool({ name: 'getPost', arguments: { id: 2 } });
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, '{"id":2}');
    const invalid = await client.callTool({ name: 'getPost', arguments: { id: '../oops' } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});

