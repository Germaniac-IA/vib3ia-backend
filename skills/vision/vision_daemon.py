import base64
import json
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = int(os.getenv("VISION_DAEMON_PORT", "18790"))
MCP_CMD = ["uvx", "minimax-coding-plan-mcp", "-y"]

lock = threading.Lock()

proc = None
proc_stdin = None
proc_stdout = None
proc_stderr = None
stderr_thread = None

def _log(msg: str):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[vision-daemon] {ts} {msg}", flush=True)

def _readline_json(timeout_s=20):
    # blocking read with timeout by polling
    start = time.time()
    buf = ""
    while time.time() - start < timeout_s:
        line = proc_stdout.readline()
        if not line:
            time.sleep(0.01)
            continue
        line = line.strip()
        if not line:
            continue
        try:
            return json.loads(line)
        except Exception:
            return {"_raw": line}
    return None

def _send(obj):
    s = json.dumps(obj, ensure_ascii=False) + "\n"
    proc_stdin.write(s)
    proc_stdin.flush()

def _stderr_pump():
    # avoid UnicodeDecodeError: read bytes and decode safely
    while True:
        b = proc_stderr.buffer.readline()
        if not b:
            return
        try:
            t = b.decode("utf-8", errors="replace").rstrip()
        except Exception:
            t = repr(b)
        if t:
            _log(f"[mcp:stderr] {t}")

def _start_mcp():
    global proc, proc_stdin, proc_stdout, proc_stderr, stderr_thread

    if not os.getenv("MINIMAX_API_KEY"):
        raise RuntimeError("MINIMAX_API_KEY no está seteada en el entorno del daemon.")

    env = os.environ.copy()
    env["MINIMAX_API_HOST"] = env.get("MINIMAX_API_HOST", "https://api.minimax.io")
    env["MINIMAX_MCP_BASE_PATH"] = env.get("MINIMAX_MCP_BASE_PATH", str(Path.home() / "Documents" / "mcp-output"))
    Path(env["MINIMAX_MCP_BASE_PATH"]).mkdir(parents=True, exist_ok=True)

    proc = subprocess.Popen(
        MCP_CMD,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    proc_stdin = proc.stdin
    proc_stdout = proc.stdout
    proc_stderr = proc.stderr

    stderr_thread = threading.Thread(target=_stderr_pump, daemon=True)
    stderr_thread.start()

    # initialize (según tu MCP ya validado)
    init_req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "clientInfo": {"name": "openclaw-vision-daemon", "version": "1.0.0"},
            "capabilities": {}
        }
    }
    _send(init_req)

    init_resp = None
    for _ in range(60):
        msg = _readline_json(timeout_s=1)
        if msg and msg.get("id") == 1:
            init_resp = msg
            break
    if not init_resp or "error" in init_resp:
        raise RuntimeError(f"initialize falló: {init_resp}")

    # warm: list tools
    _send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
    tools = None
    for _ in range(60):
        msg = _readline_json(timeout_s=1)
        if msg and msg.get("id") == 2:
            tools = msg.get("result", {})
            break
    _log(f"MCP listo. tools/list ok. tools={[(t.get('name')) for t in (tools.get('tools') or [])]}")

def ensure_mcp():
    global proc
    if proc is None or proc.poll() is not None:
        _log("Arrancando MCP…")
        _start_mcp()

def analyze_image_bytes(image_bytes: bytes, prompt: str, detail: str = "normal"):
    ensure_mcp()

    b64 = base64.b64encode(image_bytes).decode("ascii")
    call_req = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "understand_image",
            "arguments": {
                "prompt": f"{prompt}\nNivel de detalle: {detail}. Si dudás, decilo.",
                "image_source": b64
            }
        }
    }

    _send(call_req)
    # wait response
    for _ in range(240):  # ~240s max
        msg = _readline_json(timeout_s=1)
        if msg and msg.get("id") == 3:
            return msg
    return {"jsonrpc": "2.0", "id": 3, "error": {"code": -1, "message": "Timeout esperando tools/call"}}

class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            try:
                with lock:
                    ensure_mcp()
                self._json(200, {"ok": True})
            except Exception as e:
                self._json(500, {"ok": False, "error": str(e)})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/analyze":
            self._json(404, {"error": "not found"})
            return

        try:
            n = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(n)
            data = json.loads(raw.decode("utf-8"))

            prompt = data.get("prompt") or "Describí la imagen con detalle. Indicá qué ves, qué NO podés confirmar y terminá con acciones concretas."
            detail = data.get("detail") or "normal"

            if "image_path" in data:
                p = Path(data["image_path"])
                image_bytes = p.read_bytes()
            elif "image_b64" in data:
                image_bytes = base64.b64decode(data["image_b64"])
            else:
                self._json(400, {"error": "missing image_path or image_b64"})
                return

            with lock:
                resp = analyze_image_bytes(image_bytes, prompt, detail)

            self._json(200, resp)
        except Exception as e:
            self._json(500, {"error": str(e)})

def main():
    _log(f"Escuchando en http://{HOST}:{PORT}")
    httpd = HTTPServer((HOST, PORT), Handler)
    httpd.serve_forever()

if __name__ == "__main__":
    main()
