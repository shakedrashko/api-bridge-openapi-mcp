import { readFile } from 'node:fs/promises';
import { compileReadOnlyTools, invokeGet } from '../src/adapter.mjs';

const spec = JSON.parse(await readFile(new URL('./openapi.json', import.meta.url), 'utf8'));
const tool = compileReadOnlyTools(spec, ['getPost'])[0];
const body = await invokeGet(tool, { id: 2 }, 'https://jsonplaceholder.typicode.com');
const post = JSON.parse(body);
if (post.id !== 2 || typeof post.title !== 'string') throw new Error('Unexpected public API response');
console.log(JSON.stringify({ id: post.id, title: post.title }));

const githubSpec = JSON.parse(await readFile(new URL('./github-openapi.json', import.meta.url), 'utf8'));
const issueTool = compileReadOnlyTools(githubSpec, ['getGitHubIssue'])[0];
const issueBody = await invokeGet(issueTool, { owner: 'nodejs', repo: 'node', number: 1 }, 'https://api.github.com');
const issue = JSON.parse(issueBody);
if (issue.number !== 1 || typeof issue.title !== 'string') throw new Error('Unexpected GitHub API response');
console.log(JSON.stringify({ number: issue.number, title: issue.title, state: issue.state }));

