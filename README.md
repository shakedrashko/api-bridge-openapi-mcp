# API to MCP: read-only prototype

This prototype turns explicitly approved GET operations from a trusted OpenAPI document into MCP tools. A web demo can also send a user goal to an OpenAI model through Agent37 Cloud's managed model API. The model proposes one tool call; the bridge validates it against the approved tool list before making the public API request. A second model call answers the goal from the verified response while treating response text as untrusted data.

## Demo

The bundled samples describe public JSONPlaceholder posts and GitHub issues. They are not client work or a claim of prior production deployment.

```powershell
npm install
$env:OPENAPI_SPEC_FILE="demo/openapi.json"
$env:TRUSTED_API_ORIGIN="https://jsonplaceholder.typicode.com"
$env:APPROVED_GET_OPERATIONS="listPosts,getPost"
npm start
```

Connect any MCP client over stdio, then call `getPost` with `{ "id": 2 }` or `listPosts` with `{ "userId": 1 }`. With no environment variables, `npm start` exposes both bundled API sources, including `getGitHubIssue` with `{ "owner": "nodejs", "repo": "node", "number": 1 }`. To use one trusted custom spec, provide all three environment variables shown above.

For the web demo, run `npm run web`. The manual tool tester works locally. The cloud agent panel becomes available when the app runs inside an Agent37 instance with `AGENT37_LLM_PROXY_URL` and `AGENT37_MANAGED_TOKEN` injected by the platform. The planner explicitly selects `openai/gpt-5.6-luna`; check that it appears in the instance's model catalog before calling it. The Agent37 Cloud APIs create and manage the host instance; the managed LLM API supplies OpenAI inference.

The "Bring your own API" panel reads a local OpenAPI JSON file inside the browser, lets you approve supported unauthenticated GET operations, and downloads a config that embeds the spec and trusted HTTPS origin. Set `BRIDGE_CONFIG_FILE` to that JSON file when starting the MCP server. For example, in PowerShell: `$env:BRIDGE_CONFIG_FILE="C:\\path\\to\\api-bridge.config.json"; npm start`. The web demo itself keeps its two vetted public API sources; imported specs are not fetched by the demo server.

The adapter exposes only allowlisted GET operations, skips authenticated operations, validates scalar arguments, prohibits redirects, enforces HTTPS and a fixed origin, times out after eight seconds, and caps responses at 200 KB. In a real customer engagement the API origin, operation list, authentication model, and response handling must be reviewed for that API before connecting it to an agent.

