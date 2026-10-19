"""Minimal MCP (Streamable HTTP) client for the Lens Studio editor's local MCP server.

Reads the endpoint and bearer token from the project's .mcp.json, so the token is never
printed. Usage:
    python3 -I tools/lens_studio_mcp.py <project_dir> list
    python3 -I tools/lens_studio_mcp.py <project_dir> call <ToolName> <json-args | @file.json>
    python3 -I tools/lens_studio_mcp.py <project_dir> schema <ToolName>
"""

import json
import sys
import urllib.request

SESSION_FILE_SUFFIX = ".lsmcp_session"


def load_config(project):
    with open(project + "/.mcp.json", encoding="utf-8") as fh:
        cfg = json.load(fh)["mcpServers"]["lens-studio"]
    return cfg["url"], cfg.get("headers", {})


def parse_body(raw, content_type):
    text = raw.decode("utf-8", errors="replace")
    if "text/event-stream" in content_type:
        msgs = []
        for line in text.splitlines():
            if line.startswith("data:"):
                payload = line[5:].strip()
                if payload:
                    msgs.append(json.loads(payload))
        return msgs[-1] if msgs else None
    return json.loads(text) if text.strip() else None


class Client:
    def __init__(self, project):
        self.url, self.headers = load_config(project)
        self.session = None
        self.next_id = 1

    def post(self, message, expect_response=True):
        data = json.dumps(message).encode("utf-8")
        req = urllib.request.Request(self.url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json, text/event-stream")
        for k, v in self.headers.items():
            req.add_header(k, v)
        if self.session:
            req.add_header("Mcp-Session-Id", self.session)
        with urllib.request.urlopen(req, timeout=600) as resp:
            sid = resp.headers.get("Mcp-Session-Id")
            if sid:
                self.session = sid
            body = resp.read()
            if not expect_response:
                return None
            return parse_body(body, resp.headers.get("Content-Type", ""))

    def request(self, method, params=None):
        msg = {"jsonrpc": "2.0", "id": self.next_id, "method": method}
        if params is not None:
            msg["params"] = params
        self.next_id += 1
        resp = self.post(msg)
        if resp is None:
            raise RuntimeError("empty response to " + method)
        if "error" in resp:
            raise RuntimeError(json.dumps(resp["error"])[:2000])
        return resp["result"]

    def initialize(self):
        result = self.request("initialize", {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "claude-code-manual-client", "version": "0.1"},
        })
        self.post({"jsonrpc": "2.0", "method": "notifications/initialized"}, expect_response=False)
        return result


def main():
    project, cmd = sys.argv[1], sys.argv[2]
    c = Client(project)
    info = c.initialize()
    if cmd == "list":
        print("server:", json.dumps(info.get("serverInfo", {})))
        tools = c.request("tools/list").get("tools", [])
        for t in tools:
            desc = (t.get("description") or "").replace("\n", " ")
            print("- %s: %s" % (t["name"], desc[:160]))
        print("total tools:", len(tools))
    elif cmd == "schema":
        name = sys.argv[3]
        for t in c.request("tools/list").get("tools", []):
            if t["name"] == name:
                print(json.dumps(t, indent=2)[:12000])
                return
        print("no such tool:", name)
    elif cmd == "call":
        name, arg = sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "{}"
        if arg.startswith("@"):
            with open(arg[1:], encoding="utf-8") as fh:
                arg = fh.read()
        result = c.request("tools/call", {"name": name, "arguments": json.loads(arg)})
        out = []
        for part in result.get("content", []):
            if part.get("type") == "text":
                out.append(part["text"])
            elif part.get("type") == "image":
                path = "/tmp/claude-501/lsmcp_image_%d.%s" % (len(out), "png")
                import base64
                with open(path, "wb") as fh:
                    fh.write(base64.b64decode(part["data"]))
                out.append("[image saved to %s]" % path)
            else:
                out.append(json.dumps(part)[:2000])
        if result.get("isError"):
            out.insert(0, "TOOL ERROR:")
        print("\n".join(out)[:20000])
    else:
        sys.exit("unknown command")


if __name__ == "__main__":
    main()
