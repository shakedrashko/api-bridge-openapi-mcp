import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { answerGoal, planToolCall, plannerModel } from '../src/planner.mjs';

const tools = [{ name: 'getPost', path: '/posts/{id}', description: 'Read one post', params: [{ name: 'id', location: 'path' }], inputSchema: z.object({ id: z.number().int() }) }];
const options = (content) => ({ baseUrl: 'https://api.agent37.com/llm/v1', token: 'test-token', fetcher: async (url, init) => {
  assert.equal(url.href, 'https://api.agent37.com/llm/v1/chat/completions');
  assert.equal(JSON.parse(init.body).model, plannerModel().id);
  assert.equal(JSON.parse(init.body).reasoning_effort, plannerModel().reasoningEffort);
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
} });

test('cloud planner selects a validated approved tool with explicit model', async () => {
  const plan = await planToolCall('Show post 2', tools, options('{"name":"getPost","args":{"id":2}}'));
  assert.equal(plan.tool.name, 'getPost');
  assert.deepEqual(plan.args, { id: 2 });
  assert.equal(plan.model, 'openai/gpt-5.6-luna');
  assert.equal(plannerModel().reasoningEffort, 'low');
});

test('cloud planner rejects a tool outside the allowlist and invalid arguments', async () => {
  await assert.rejects(planToolCall('Delete all posts', tools, options('{"name":"deletePost","args":{"id":2}}')), /unapproved tool/);
  await assert.rejects(planToolCall('Show post two', tools, options('{"name":"getPost","args":{"id":"two"}}')));
});

test('answer uses the verified API response and explicit model', async () => {
  const reply = await answerGoal('What is the title of post 2?', 'getPost', { id: 2, title: 'qui est esse' }, {
    baseUrl: 'https://api.agent37.com/llm/v1', token: 'test-token',
    fetcher: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.model, plannerModel().id);
      assert.match(body.messages[0].content, /qui est esse/);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'The title is "qui est esse".' } }] }), { status: 200 });
    },
  });
  assert.equal(reply, 'The title is "qui est esse".');
});

