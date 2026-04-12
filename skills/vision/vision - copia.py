import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

def die(msg, code=1):
    print(msg, file=sys.stderr)
    sys.exit(code)

def read_json_line(stream):
    line = stream.readline()
    if not line:
        return None
    line = line.decode("utf-8", errors="replace").strip()
    if not line:
        return None
    try:
        return json.loads(line)
    except Exception:
        return {"_raw": line}

def write_json(stream, obj):
    data = (json.dumps(obj, ensure_ascii=False) + "\n")
    stream.write(data)
    stream.flush()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True, help="Path to image (jpg/png)")
    ap.add_argument("--prompt", default="Describí la imagen con detalle. Indicá qué ves, qué NO podés confirmar y terminá con acciones concretas.")
    ap.add_argument("--detail", default="normal")
    args = ap.parse_args()

    if not os.getenv("MINIMAX_API_KEY"):
        # Try to read from minimaxapi.txt in workspace
        api_file = Path.home() / ".openclaw" / "workspace" / "minimaxapi.txt"
        if api_file.exists():
            api_key = api_file.read_text().strip()
            os.environ["MINIMAX_API_KEY"] = api_key
        else:
            die("Falta MINIMAX_API_KEY (Coding Plan) en el entorno.", 2)

    image_path = str(Path(args.image).expanduser().resolve())
    if not Path(image_path).exists():
        die(f"No existe la imagen: {image_path}", 2)

    # Start MCP server (stdio)
    env = os.environ.copy()
    env["MINIMAX_API_HOST"] = os.getenv("MINIMAX_API_HOST", "https://api.minimax.io")
    env["MINIMAX_MCP_BASE_PATH"] = os.getenv("MINIMAX_MCP_BASE_PATH", str(Path.home() / "Documents" / "mcp-output"))
    # Ensure output directory exists
    Path(env["MINIMAX_MCP_BASE_PATH"]).mkdir(parents=True, exist_ok=True)

    proc = subprocess.Popen(
        ["uvx", "minimax-coding-plan-mcp", "-y"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        bufsize=0,  # Unbuffered
        text=True,
    )

    if proc.stdin is None or proc.stdout is None:
        die("No pude abrir stdio con el MCP server.", 3)

    # MCP handshake (best-effort): initialize then list_tools then call_tool
    # NOTE: Different MCP implementations vary. We'll try common shapes and be tolerant.
    init = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "clientInfo": {"name": "openclaw-vision", "version": "1.0.0"},
            "capabilities": {}
        }
    }
    write_json(proc.stdin, init)

    # Read responses until we see id 1 or timeout
    t0 = time.time()
    while time.time() - t0 < 5:
        msg = read_json_line(proc.stdout)
        if msg and msg.get("id") == 1:
            break

    # list tools
    list_tools = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
    write_json(proc.stdin, list_tools)

    tools = None
    t0 = time.time()
    while time.time() - t0 < 5:
        msg = read_json_line(proc.stdout)
        if msg and msg.get("id") == 2:
            tools = msg.get("result", msg)
            break

    # call understand_image
    call = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "understand_image",
            "arguments": {
                "prompt": f"{args.prompt}\nNivel de detalle: {args.detail}. Si dudás, decilo.",
                "image_url": image_path
            }
        }
    }
    write_json(proc.stdin, call)

    result = None
    t0 = time.time()
    while time.time() - t0 < 60:
        msg = read_json_line(proc.stdout)
        if msg and msg.get("id") == 3:
            result = msg.get("result", msg)
            break

    # Try to print useful text
    if result is None:
        die("Timeout esperando respuesta de understand_image.", 4)

    # MCP tool results often: {"content":[{"type":"text","text":"..."}]}
    content = None
    if isinstance(result, dict):
        content = result.get("content")
    if isinstance(content, list):
        out = []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text" and "text" in c:
                out.append(c["text"])
        if out:
            print("\n".join(out))
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))

    try:
        proc.terminate()
    except Exception:
        pass

if __name__ == "__main__":
    main()
