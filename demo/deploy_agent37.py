"""Deploy API Bridge to Agent37 using its official Hosting and instance APIs.

Requires AGENT37_API_KEY in the process environment. Never prints the key.
"""

import json
import os
from pathlib import Path
import urllib.parse
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
KEY = os.environ.get("AGENT37_API_KEY")
HOSTING = "https://api.agent37.com/v1"
UPLOADS = [
    "package.json", "package-lock.json", "demo/openapi.json", "demo/github-openapi.json",
    "src/adapter.mjs", "src/planner.mjs", "src/web.mjs",
    "public/index.html", "public/style.css", "public/app.js",
]


def request(method, url, *, body=None, instance=False):
    headers = {"X-Agent37-Key" if instance else "Authorization": KEY if instance else f"Bearer {KEY}"}
    if isinstance(body, dict):
        body = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers, method=method), timeout=150) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read(2000).decode("utf-8", errors="replace")
        raise RuntimeError(f"Agent37 HTTP {error.code}: {detail}") from error


def deploy():
    if not KEY:
        raise SystemExit("Set AGENT37_API_KEY in this process environment before deploying")
    instance = request("POST", f"{HOSTING}/instances", body={
        "template": "agent37-hermes",
        "name": "api-bridge-hackathon",
        "budget": {"credit_micros": 500_000},
        "public_ports": [{"port": 4187, "prefix": "api-bridge", "label": "API Bridge demo"}],
        "env": {"AGENT37_MANAGED_PLUGIN_PERFLO_ENABLED": "false"},
    })
    instance_id = instance["id"]
    base = instance["url"]
    print(f"Created instance {instance_id} ({instance['status']})")
    for relative in UPLOADS:
        destination = f"/home/node/api-bridge/{relative}"
        url = f"{base}/v1/files/content?{urllib.parse.urlencode({'path': destination})}"
        request("PUT", url, body=(ROOT / relative).read_bytes(), instance=True)
    print(f"Uploaded {len(UPLOADS)} project files")
    install = request("POST", f"{HOSTING}/instances/{instance_id}/exec", body={"command": "cd /home/node/api-bridge && npm ci --omit=dev --silent"})
    if install["exit_code"] != 0:
        raise RuntimeError(f"Remote dependency install failed: {install['stderr'][-1000:]}")
    run = request("POST", f"{HOSTING}/instances/{instance_id}/exec", body={"command": "cd /home/node/api-bridge && HOST=0.0.0.0 PORT=4187 nohup node src/web.mjs > /home/node/api-bridge/web.log 2>&1 < /dev/null &"})
    if run["exit_code"] != 0:
        raise RuntimeError(f"Remote server launch failed: {run['stderr'][-1000:]}")
    public = next((item["url"] for item in instance.get("public_ports", []) if item["port"] == 4187), None)
    if not public:
        ports = request("GET", f"{HOSTING}/instances/{instance_id}/public-ports")
        public = next(item["url"] for item in ports if item["port"] == 4187)
    metadata = {"instance_id": instance_id, "public_url": public, "model": "openai/gpt-5.6-luna", "reasoning_effort": "low"}
    output = ROOT.parent.parent / "outputs" / "agent37-instance.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata))


if __name__ == "__main__":
    deploy()

