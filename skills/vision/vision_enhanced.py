#!/usr/bin/env python3
"""
Vision Enhanced v3.0
Vision funcional + modos mejorados
"""

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


# ============ MODOS ============
MODOS = {
    "producto": {
        "prompt": """Analiza esta imagen PARA CATALOGO PRODUCTIVO:
1. PRODUCTO: Que objeto/item veo?
2. MATERIALES: De que esta hecho?
3. COLORES: Paleta principal
4. DIMENSIONES: Aproximadas
5. ESTADO: Nuevo/usado/daniado
6. USO: Para que sirve?""",
        "contexto": "laboral"
    },
    "ocr": {
        "prompt": """Extrae datos ESTRUCTURADOS:
1. NUMEROS: Todos los numeros (montos, fechas, codigos)
2. TEXTOS: Nombres, direcciones, telefonos
3. TABLAS: Si hay tabla, extrae filas/columnas
4. FORMATO: Factura/contrato/recibo/otro?
5. JSON: Podrias formatear como JSON?""",
        "contexto": "laboral"
    },
    "inventario": {
        "prompt": """Hace INVENTARIO:
1. ITEMS: Cuantos items diferentes?
2. CANTIDADES: Cuantos de cada uno?
3. ESTADO: Nuevos/usados/danados?
4. ORGANIZACION: Estan ordenados?
5. RESUMEN: Total de items?""",
        "contexto": "laboral"
    },
    "comparacion": {
        "prompt": """Compara con la imagen anterior:
1. CAMBIOS: Que items aparecen nuevos?
2. ELIMINADOS: Que items ya no estan?
3. MODIFICADOS: Que items cambiaron?
4. CONCLUSION: Cambio poco/mucho/nada?""",
        "contexto": "laboral"
    },
    "fotografo": {
        "prompt": """MODO FOTOGRAFO - Como mejorar la foto:
1. ILUMINACION: Podria venir de otro lado?
2. ANGULO: Desde donde seria mejor?
3. FOCO: Esta desenfocado algo importante?
4. OBSTACULOS: Algo tapa lo importante?
5. SUGERENCIA: Para ver mejor X, podrias:| - Acercarte a Y| - Mover la luz hacia Z""",
        "contexto": "laboral"
    },
    "dashboard": {
        "prompt": """Analiza este DASHBOARD:
1. TIPO: Que tipo de panel es?
2. KPIs: Numeros principales
3. ANOMALIAS: Algo fuera de lo normal?
4. PERIODO: Hoy/semana/mes?
5. TENDENCIA: Suben/bajan/estables?
6. ACCION: Cual es la metrica mas importante?""",
        "contexto": "laboral"
    },
    "documento": {
        "prompt": """Analiza este DOCUMENTO:
1. TIPO: Factura/contrato/recibo/memo?
2. DATOS: Numeros, fechas, montos, nombres
3. ESTADO: Pagado/vigente/vencido?
4. ACCION: Hay algo que hacer?
5. URGENCIA: Normal/pronto/urgente?""",
        "contexto": "laboral"
    },
    "espacio": {
        "prompt": """Analiza este ESPACIO:
1. TIPO: Oficina/local/deposito/hogar?
2. OBJETOS: Que muebles/equipamiento?
3. ORGANIZACION: Ordenado/desordenado?
4. AMBIENTE: Profesional/calido/frio?
5. CAPACIDAD: Cuantas personas?""",
        "contexto": "laboral"
    },
    "evento": {
        "prompt": """Analiza este EVENTO:
1. QUE SUCEDE: Describe la escena
2. SENTIMIENTO: Alegría/nostalgia/celebracion?
3. PERSONAS: Cuantas, que relacion hay?
4. AMBIENTE: Formal/casual/intimo?
5. MOMENTO: Importante o casual?
6. EMOCION: Que emocion predomina?""",
        "contexto": "personal"
    }
}


# ============ UTILS ============
def die(msg, code=1):
    print(msg, file=sys.stderr)
    sys.exit(code)

def guess_mime(path):
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

def make_data_url(image_path):
    p = Path(image_path)
    data = p.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    mime = guess_mime(str(p))
    return f"data:{mime};base64,{b64}"

def send(stream, obj):
    stream.write(json.dumps(obj, ensure_ascii=False) + "\n")
    stream.flush()

def cleanup_process(proc):
    if proc is None:
        return
    try:
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=2)
        if proc.poll() is None:
            proc.kill()
    except Exception:
        pass

def stdout_reader(proc, out_q, stop_event):
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
    except Exception:
        pass

def stderr_reader(proc, err_buf, stop_event):
    if proc.stderr is None:
        return
    try:
        while not stop_event.is_set():
            line = proc.stderr.readline()
            if not line:
                break
            err_buf.append(line.rstrip("\n"))
    except Exception:
        pass

def wait_for_id(out_q, target_id, timeout_s):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            msg = out_q.get(timeout=min(0.5, deadline - time.time()))
        except Empty:
            continue
        if isinstance(msg, dict) and msg.get("id") == target_id:
            return msg
    return None

def detectar_modo(prompt):
    prompt_lower = prompt.lower()
    
    ocr_kw = ["factura", "recibo", "datos", "tabla", "json", "estructurados"]
    if any(kw in prompt_lower for kw in ocr_kw):
        return "ocr"
    
    inv_kw = ["inventario", "cuantos", "contar", "items", "stock"]
    if any(kw in prompt_lower for kw in inv_kw):
        return "inventario"
    
    comp_kw = ["compará", "antes", "después", "cambio", "diferente"]
    if any(kw in prompt_lower for kw in comp_kw):
        return "comparacion"
    
    foto_kw = ["fotógrafo", "foto", "iluminación", "ángulo"]
    if any(kw in prompt_lower for kw in foto_kw):
        return "fotografo"
    
    dash_kw = ["dashboard", "métricas", "kpis", "números"]
    if any(kw in prompt_lower for kw in dash_kw):
        return "dashboard"
    
    doc_kw = ["documento", "factura", "contrato"]
    if any(kw in prompt_lower for kw in doc_kw):
        return "documento"
    
    esp_kw = ["espacio", "oficina", "local"]
    if any(kw in prompt_lower for kw in esp_kw):
        return "espacio"
    
    evt_kw = ["evento", "celebración", "momento"]
    if any(kw in prompt_lower for kw in evt_kw):
        return "evento"
    
    return "producto"  # default


# ============ MAIN ============
def main():
    ap = argparse.ArgumentParser(description="Vision Enhanced v3.0")
    ap.add_argument("--image", required=True, help="Path a imagen (jpg/png/webp)")
    ap.add_argument("--prompt", default="Describe esta imagen")
    ap.add_argument("--mode", default="auto", 
                    choices=["auto", "producto", "ocr", "inventario", "comparacion", 
                            "fotografo", "dashboard", "documento", "espacio", "evento"])
    ap.add_argument("--detail", default="normal")
    ap.add_argument("--timeout", type=int, default=90)
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    # API key
    if not os.getenv("MINIMAX_API_KEY"):
        api_file = Path.home() / ".openclaw" / "workspace" / "minimaxapi.txt"
        if api_file.exists():
            os.environ["MINIMAX_API_KEY"] = api_file.read_text(encoding="utf-8").strip()
        else:
            die("Falta MINIMAX_API_KEY.", 2)

    image_path = str(Path(args.image).expanduser().resolve())
    if not Path(image_path).exists():
        die(f"No existe: {image_path}", 2)

    # Modo
    if args.mode == "auto":
        modo = detectar_modo(args.prompt)
    else:
        modo = args.mode

    prompt_final = args.prompt
    if modo in MODOS:
        modo_config = MODOS[modo]
        if "prompt" in modo_config:
            prompt_final = modo_config["prompt"] + "\n\n" + args.prompt

    print(f"Modo: {modo}", file=sys.stderr)

    env = os.environ.copy()
    env["MINIMAX_API_HOST"] = os.getenv("MINIMAX_API_HOST", "https://api.minimax.io")
    env["MINIMAX_MCP_BASE_PATH"] = os.getenv("MINIMAX_MCP_BASE_PATH", 
                                          str(Path.home() / "Documents" / "mcp-output"))
    Path(env["MINIMAX_MCP_BASE_PATH"]).mkdir(parents=True, exist_ok=True)

    print("Iniciando MCP...", file=sys.stderr)

    proc = None
    stop_event = threading.Event()
    out_q = Queue()
    err_buf = deque(maxlen=200)

    try:
        proc = subprocess.Popen(
            ["uvx", "minimax-coding-plan-mcp", "-y"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
            encoding="utf-8"
        )

        if proc.stdin is None or proc.stdout is None:
            die("No pude abrir stdio.", 3)

        t_out = threading.Thread(target=stdout_reader, args=(proc, out_q, stop_event), daemon=True)
        t_err = threading.Thread(target=stderr_reader, args=(proc, err_buf, stop_event), daemon=True)
        t_out.start()
        t_err.start()

        # Initialize
        init_req = {
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "clientInfo": {"name": "openclaw-vision-enhanced", "version": "3.0"},
                "capabilities": {}
            }
        }
        send(proc.stdin, init_req)

        init_resp = wait_for_id(out_q, 1, timeout_s=15.0)
        if not init_resp:
            die("Timeout en initialize.", 4)

        # List tools
        list_req = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
        send(proc.stdin, list_req)

        tools_resp = wait_for_id(out_q, 2, timeout_s=10.0)
        if tools_resp and "result" in tools_resp:
            tools = tools_resp["result"]
            if isinstance(tools, dict):
                tools = tools.get("tools") or []
            if isinstance(tools, list):
                names = [t.get("name") for t in tools if isinstance(t, dict)]
                if names:
                    print(f"Tools: {', '.join(names)}", file=sys.stderr)

        # Call understand_image
        data_url = make_data_url(image_path)

        call_req = {
            "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": {
                "name": "understand_image",
                "arguments": {
                    "prompt": f"{prompt_final}\nNivel: {args.detail}",
                    "image_source": data_url
                }
            }
        }
        send(proc.stdin, call_req)

        call_resp = wait_for_id(out_q, 3, timeout_s=float(args.timeout))
        if not call_resp:
            die("Timeout en understand_image.", 5)

        # Parse result
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
            text_out = json.dumps(call_resp, ensure_ascii=False, indent=2)

        print(text_out)

    finally:
        stop_event.set()
        cleanup_process(proc)


if __name__ == "__main__":
    main()
