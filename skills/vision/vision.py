import argparse
import base64
import json
import mimetypes
import os
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
from queue import Queue, Empty


# ---------------------------
# Utils
# ---------------------------

def die(msg: str, code: int = 1):
    print(msg, file=sys.stderr)
    sys.exit(code)

def guess_mime(path: str) -> str:
    mt, _ = mimetypes.guess_type(path)
    if mt:
        return mt
    ext = Path(path).suffix.lower()
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    if ext == ".png":
        return "image/png"
    if ext == ".webp":
        return "image/webp"
    return "application/octet-stream"

def is_url(text: str) -> bool:
    return text.startswith("http://") or text.startswith("https://")

def fetch_url_to_data_url(url: str) -> str:
    import urllib.request
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
        data = resp.read()
        content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
        b64 = base64.b64encode(data).decode("ascii")
        return f"data:{content_type};base64,{b64}"

def make_data_url(image_path: str) -> str:
    if is_url(image_path):
        print(f"Detectado URL, descargando: {image_path}")
        return fetch_url_to_data_url(image_path)
    p = Path(image_path)
    data = p.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    mime = guess_mime(str(p))
    return f"data:{mime};base64,{b64}"

def send(stream, obj):
    # stream is text-mode with utf-8 encoding
    stream.write(json.dumps(obj, ensure_ascii=False) + "\n")
    stream.flush()

def cleanup_process(proc: subprocess.Popen, debug: bool = False):
    if proc is None:
        return
    try:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except Exception:
                pass
        if proc.poll() is None:
            proc.kill()
    except Exception as e:
        if debug:
            print(f"[debug] cleanup_process error: {e}", file=sys.stderr)


# ---------------------------
# Readers (NO message loss)
# ---------------------------

def stdout_reader(proc: subprocess.Popen, out_q: Queue, stop_event: threading.Event):
    """
    Continuously read stdout lines, parse JSON if possible, push into queue.
    """
    if proc.stdout is None:
        return
    try:
        while not stop_event.is_set():
            line = proc.stdout.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            try:
                out_q.put(json.loads(line))
            except Exception:
                out_q.put({"_raw": line})
    except Exception as e:
        out_q.put({"_stdout_reader_error": str(e)})

def stderr_reader(proc: subprocess.Popen, err_buf: deque, debug: bool, stop_event: threading.Event):
    """
    Continuously read stderr lines (avoid blocking) and keep last N lines.
    """
    if proc.stderr is None:
        return
    try:
        while not stop_event.is_set():
            line = proc.stderr.readline()
            if not line:
                break
            # keep last ~200 lines
            err_buf.append(line.rstrip("\n"))
            if debug:
                sys.stderr.write(f"[mcp:stderr] {line}")
                sys.stderr.flush()
    except Exception:
        pass

def wait_for_id(out_q: Queue, target_id: int, timeout_s: float):
    """
    Wait until we receive a message with msg['id']==target_id.
    Returns the message dict or None on timeout.
    """
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        remaining = max(0.05, deadline - time.time())
        try:
            msg = out_q.get(timeout=min(0.5, remaining))
        except Empty:
            continue
        if isinstance(msg, dict) and msg.get("id") == target_id:
            return msg
        # ignore unrelated messages/notifications
    return None


# ---------------------------
# Main
# ---------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True, help="Path to image (jpg/png/webp) OR URL (http/https)")
    ap.add_argument("--prompt", default="Describí la imagen con detalle. Indicá qué ves, qué NO podés confirmar y terminá con acciones concretas.")
    ap.add_argument("--detail", default="normal")
    ap.add_argument("--timeout", type=int, default=90, help="Timeout total (segundos) para understand_image")
    ap.add_argument("--debug", action="store_true", help="Muestra stderr del MCP y mensajes extra")
    args = ap.parse_args()

    # Ensure API key exists
    if not os.getenv("MINIMAX_API_KEY"):
        api_file = Path.home() / ".openclaw" / "workspace" / "minimaxapi.txt"
        if api_file.exists():
            os.environ["MINIMAX_API_KEY"] = api_file.read_text(encoding="utf-8", errors="ignore").strip()
        else:
            die("Falta MINIMAX_API_KEY (Coding Plan) en el entorno.", 2)

    image_arg = args.image

    # Check if it's a URL or local file
    if is_url(image_arg):
        print(f"Input es una URL: {image_arg}")
    else:
        image_path = str(Path(image_arg).expanduser().resolve())
        if not Path(image_path).exists():
            die(f"No existe la imagen: {image_path}", 2)

    env = os.environ.copy()
    env["MINIMAX_API_HOST"] = os.getenv("MINIMAX_API_HOST", "https://api.minimax.io")
    env["MINIMAX_MCP_BASE_PATH"] = os.getenv(
        "MINIMAX_MCP_BASE_PATH",
        str(Path.home() / "Documents" / "mcp-output")
    )
    Path(env["MINIMAX_MCP_BASE_PATH"]).mkdir(parents=True, exist_ok=True)

    print("Iniciando MCP server...")

    proc = None
    stop_event = threading.Event()
    out_q: Queue = Queue()
    err_buf = deque(maxlen=200)

    try:
        proc = subprocess.Popen(
            ["uvx", "minimax-coding-plan-mcp", "-y"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )

        if proc.stdin is None or proc.stdout is None:
            die("No pude abrir stdio con el MCP server.", 3)

        # Start readers
        t_out = threading.Thread(target=stdout_reader, args=(proc, out_q, stop_event), daemon=True)
        t_err = threading.Thread(target=stderr_reader, args=(proc, err_buf, args.debug, stop_event), daemon=True)
        t_out.start()
        t_err.start()

        print("MCP iniciado. Enviando initialize...")

        init_req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "clientInfo": {"name": "openclaw-vision", "version": "1.0.0"},
                "capabilities": {}
            }
        }
        send(proc.stdin, init_req)

        init_resp = wait_for_id(out_q, 1, timeout_s=15.0)
        if not init_resp:
            print("Timeout esperando respuesta de initialize.", file=sys.stderr)
            if err_buf:
                print("\nÚltimas líneas de stderr del MCP:", file=sys.stderr)
                for l in list(err_buf)[-25:]:
                    print(f"[mcp:stderr] {l}", file=sys.stderr)
            sys.exit(4)

        if "error" in init_resp:
            die("El MCP rechazó initialize:\n" + json.dumps(init_resp, ensure_ascii=False, indent=2), 4)

        # list tools
        list_req = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
        send(proc.stdin, list_req)

        tools_resp = wait_for_id(out_q, 2, timeout_s=10.0)
        if tools_resp and "result" in tools_resp and isinstance(tools_resp["result"], dict):
            tools = tools_resp["result"].get("tools") or tools_resp["result"].get("items") or []
            if isinstance(tools, list):
                names = [t.get("name") for t in tools if isinstance(t, dict) and t.get("name")]
                if names:
                    print("Tools disponibles: " + ", ".join(names))

        # call understand_image with image_source
        data_url = make_data_url(image_arg)

        print("Enviando request understand_image...")

        call_req = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "understand_image",
                "arguments": {
                    "prompt": f"{args.prompt}\nNivel de detalle: {args.detail}. Si dudás, decilo.",
                    "image_source": data_url
                }
            }
        }
        send(proc.stdin, call_req)

        call_resp = wait_for_id(out_q, 3, timeout_s=float(args.timeout))
        if not call_resp:
            print("Timeout esperando respuesta de understand_image.", file=sys.stderr)
            if err_buf:
                print("\nÚltimas líneas de stderr del MCP:", file=sys.stderr)
                for l in list(err_buf)[-25:]:
                    print(f"[mcp:stderr] {l}", file=sys.stderr)
            sys.exit(5)

        if args.debug:
            print("\nRespuesta recibida:\n")
            print(json.dumps(call_resp, ensure_ascii=False, indent=2))
            print("\n--- TEXTO ---\n")

        result = call_resp.get("result")
        text_out = None

        if isinstance(result, dict):
            content = result.get("content")
            if isinstance(content, list):
                parts = []
                for c in content:
                    if isinstance(c, dict) and c.get("type") == "text" and "text" in c:
                        parts.append(c["text"])
                if parts:
                    text_out = "\n".join(parts)

            if not text_out:
                sc = result.get("structuredContent")
                if isinstance(sc, dict) and sc.get("type") == "text" and "text" in sc:
                    text_out = sc["text"]

        if not text_out:
            text_out = json.dumps(call_resp, ensure_ascii=False, indent=2)

        print(text_out)

    finally:
        stop_event.set()
        cleanup_process(proc, debug=args.debug)


if __name__ == "__main__":
    main()
