const url = process.env.AGENT37_LLM_PROXY_URL;
const token = process.env.AGENT37_MANAGED_TOKEN;
if (!url || !token) throw new Error('Agent37 managed model environment is missing');
const endpoint = new URL('models', `${url.replace(/\/$/, '')}/`);
const response = await fetch(endpoint, {
  headers: { authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`Agent37 model catalog returned HTTP ${response.status}`);
const catalog = await response.json();
console.log(JSON.stringify((catalog.data || []).map(({ id }) => id).filter((id) => typeof id === 'string')));

