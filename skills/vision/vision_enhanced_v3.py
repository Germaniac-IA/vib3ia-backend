#!/usr/bin/env python3
"""
Vision Enhanced Skill v3.0
Combina el vision.py funcional con las funcionalidades del vision_enhanced original
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


# ============ CONFIGURACIÓN MEJORADA ============
CONFIG = {
    "memory_path": "memory/vision_memory.json",
    "corrections_path": "memory/vision_corrections.json",
    "contexts": ["laboral", "personal", "tecnico", "documento", "desconocido"],
    
    # Modos laborales
    "laboral_modes": {
        "producto": {
            "prompt": """Analizá esta imagen COMO PARA UN CATÁLOGO PRODUCTIVO:
1. PRODUCTO: ¿Qué objeto/item veo?
2. MATERIALES: De qué está hecho (madera, metal, tela, etc.)?
3. COLORES: Paleta principal y secundarios
4. DIMENSIONES: Aproximadas (chico/mediano/grande, comparable a qué?)
5. ESTADO: Nuevo, usado, dañado, impecable?
6. DETALLES: Características distintivas, marca visible, calidad aparente
7. USO SUGERIDO: Para qué parece servir?
8. PREGUNTA: Hay algo que no me queda claro de la imagen?""",
            "context": "laboral"
        },
        "ocr": {
            "prompt": """Extrae datos ESTRUCTURADOS de esta imagen:
1. NÚMEROS: Todos los números que veas (montos, fechas, códigos)
2. TEXTOS: Nombres, direcciones, teléfonos, emails
3. TABLAS: Si hay una tabla, extrae filas y columnas
4. FORMATO: Es factura, contrato, recibo, remito, otro?
5. TOTAL: Si hay un total, cuál es?
6. JSON: Podés formatear esto como JSON?""",
            "context": "laboral"
        },
        "inventario": {
            "prompt": """Hacé un INVENTARIO de esta imagen:
1. ITEMS: Cuántos items diferentes hay?
2. CANTIDADES: Cuántos de cada uno?
3. ESTADO: Nuevos, usados, dañados?
4. ORGANIZACIÓN: Están ordenados, desordenados?
5. RESUMEN: Hay un total de items?""",
            "context": "laboral"
        },
        "comparacion": {
            "prompt": """Compará esta imagen con la anterior:
1. CAMBIOS: Qué items aparecen nuevos?
2. ELIMINADOS: Qué items ya no están?
3. MODIFICADOS: Qué items cambiaron de posición o estado?
4. CONCLUSIÓN: El inventario cambió poco, mucho, o nada?""",
            "context": "laboral"
        },
        "fotografo": {
            "prompt": """MODO FOTÓGRAFO - QUÉ FALTA PARA MEJORAR:
1. ILUMINACIÓN: Podría venir de otro lado?
2. ÁNGULO: Desde dónde sería mejor ver esto?
3. FOCO: Está desenfocado algo importante?
4. OBSTÁCULOS: Algo tapa lo importante?
5. SUGERENCIA: Para ver mejor X, podrías:
   - Acercarte a [Y]
   - Mover la luz hacia [Z]""",
            "context": "laboral"
        },
        "dashboard": {
            "prompt": """Analizá este DASHBOARD/INTERFAZ:
1. TIPO: Qué tipo de panel es (ventas, analytics, sistema, etc.)?
2. KPIs: Números o métricas principales que ves
3. ANOMALÍAS: Algo que destaque o parezca fuera de lo normal?
4. PERÍODO: Parece ser de hoy, esta semana, este mes?
5. TENDENCIA: Los números suben, bajan, estables?
6. ACCIÓN: Qué parece ser la métrica más importante para actuar?""",
            "context": "laboral"
        },
        "documento": {
            "prompt": """Analizá este DOCUMENTO:
1. TIPO: Factura, contrato, recibo, memo, otro?
2. DATOS CLAVE: Números importantes, fechas, montos, nombres
3. ESTADO: Pagado/no pagado, vigente/vencido, aprobado/pendiente?
4. ACCIÓN REQUERIDA: Hay algo que debás hacer con esto?
5. URGENCIA: Normal, pronto, urgente?""",
            "context": "laboral"
        },
        "espacio": {
            "prompt": """Analizá este ESPACIO FÍSICO:
1. TIPO: Oficina, local, depósito, hogar, otro?
2. OBJETOS: Qué muebles/equipamiento veo?
3. ORGANIZACIÓN: Ordenado, desordenado, en transición?
4. AMBIENTE: Profesional, cálido, frío, industrial?
5. CAPACIDAD: Aproximadamente cuántas personas?""",
            "context": "laboral"
        }
    },
    
    # Modos personales
    "personal_modes": {
        "evento": {
            "prompt": """Analizá este EVENTO/MOMENTO:
1. QUÉ SUCEDE: Describe la escena
2. SENTIMIENTO GENERAL: Alegría, nostalgia, celebración, reflexión?
3. PERSONAS: Cuántas, qué relación parece haber entre ellos?
4. AMBIENTE: Formal, casual, íntimo, masivo?
5. MOMENTO: Es un momento importante o casual?
6. QUÉ TRANSMITE: Qué emoción predomina?""",
            "context": "personal"
        },
        "lugar": {
            "prompt": """Analizá este LUGAR/ESCENA:
1. QUÉ ES: Un lugar público, privado, natural?
2. ACTIVIDAD: Qué actividad principal ocurre?
3. PERSONAS: Cuántas, qué hacen?
4. AMBIENTE: Alegre, melancólico, movimentado, tranquilo?
5. DETALLE: Algo que destaque como único o especial?""",
            "context": "personal"
        },
        "objeto": {
            "prompt": """Analizá este OBJETO/THING:
1. QUÉ ES: Objeto cotidiano, artístico, funcional?
2. MATERIAL: De qué está hecho?
3. COLOR: Predominante y secundarios
4. FORMA:Geométrica, orgánica, irregular?
5. PERCEPCIÓN: Qué transmite este objeto?""",
            "context": "personal"
        }
    },
    
    # Modos técnicos
    "tecnico_modes": {
        "codigo": {
            "prompt": """Analizá este CÓDIGO:
1. LENGUAJE: Qué lenguaje de programación es?
2. FUNCIONALIDAD: Qué hace este código?
3. ERRORES: Hay errores visibles o warnings?
4. CALIDAD: El código se ve limpio, organizado, confuso?
5. ARCHIVO: Es un archivo completo o un fragmento?""",
            "context": "tecnico"
        },
        "arquitectura": {
            "prompt": """Analizá este DIAGRAMA/ARQUITECTURA:
1. TIPO: Sistema, base de datos, red, otro?
2. COMPONENTES: Qué elementos principales veo?
3. FLUJOS: Cómo se conectan?
4. ESCALA: Parece simple, complejo, enterprise?
5. PROPÓSITO: Para qué sirve este sistema?""",
            "context": "tecnico"
        },
        "infra": {
            "prompt": """Analizá esta INFRAESTRUCTURA:
1. TIPO: Servidor, red, nube, otro?
2. COMPONENTES: Qué hardware o servicios veo?
3. ESTADO: Está activo, inactivo, en mantenimiento?
4. CAPACIDAD: Parece potente, básico, sobrecargado?
5. CONEXIONES: Cómo se conecta con otros sistemas?""",
            "context": "tecnico"
        }
    }
}


# ============ UTILS ============
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

def make_data_url(image_path: str) -> str:
    p = Path(image_path)
    data = p.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    mime = guess_mime(str(p))
    return f"data:{mime};base64,{b64}"

def send(stream, obj):
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


# ============ READERS ============
def stdout_reader(proc: subprocess.Popen, out_q: Queue, stop_event: threading.Event):
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

def stderr_reader(proc: subprocess.Popen, err_buf: deque, debug: bool, stop_event: threading.Event):
    if proc.stderr is None:
        return
    try:
        while not stop_event.is_set():
            line = proc.stderr.readline()
            if not line:
                break
            err_buf.append(line.rstrip("\n"))
            if debug:
                sys.stderr.write(f"[mcp:stderr] {line}")
                sys.stderr.flush()
    except Exception:
        pass

def wait_for_id(out_q: Queue, target_id: int, timeout_s: float):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        remaining = max(0.05, deadline - time.time())
        try:
            msg = out_q.get(timeout=min(0.5, remaining))
        except Empty:
            continue
        if isinstance(msg, dict) and msg.get("id") == target_id:
            return msg
    return None


# ============ MODO SELECCIÓN ============
def detectar_modo(prompt: str) -> str:
    """Detecta qué modo usar según el prompt"""
    prompt_lower = prompt.lower()
    
    # OCR keywords
    ocr_keywords = ["factura", "recibo", "datos estructurados", "extrae datos", "json", "tabla"]
    if any(kw in prompt_lower for kw in ocr_keywords):
        return "ocr"
    
    # Inventario keywords
    inv_keywords = ["inventario", "cuantos", "contar", "items", "stock", "existe", "hay"]
    if any(kw in prompt_lower for kw in inv_keywords):
        return "inventario"
    
    # Comparación keywords
    comp_keywords = ["compará", "antes", "después", "cambio", "diferente", "cambió"]
    if any(kw in prompt_lower for kw in comp_keywords):
        return "comparacion"
    
    # Fotógrafo keywords
    foto_keywords = ["fotógrafo", "foto", "iluminación", "ángulo", "enfocar"]
    if any(kw in prompt_lower for kw in foto_keywords):
        return "fotografo"
    
    # Producto/Catálogo
    prod_keywords = ["producto", "catálogo", "material", "color", "dimensión"]
    if any(kw in prompt_lower for kw in prod_keywords):
        return "producto"
    
    # Dashboard
    dash_keywords = ["dashboard", "métricas", "kpis", "números"]
    if any(kw in prompt_lower for kw in dash_keywords):
        return "dashboard"
    
    # Documento
    doc_keywords = ["documento", "factura", "contrato", "recibo"]
    if any(kw in prompt_lower for kw in doc_keywords):
        return "documento"
    
    # Espacio
    espacio_keywords = ["espacio", "oficina", "local", "depósito"]
    if any(kw in prompt_lower for kw in espacio_keywords):
        return "espacio"
    
    # Evento personal
    evento_keywords = ["evento", "celebración", "momento"]
    if any(kw in prompt_lower for kw in evento_keywords):
        return "evento"
    
    # Default: producto
    return "producto"


# ============ MAIN ============
def main():
    ap = argparse.ArgumentParser(description="Vision Enhanced v3.0")
    ap.add_argument("--image", required=True, help="Path to image (jpg/png/webp)")
    ap.add_argument("--prompt", default="Describí la imagen con detalle")
    ap.add_argument("--mode", default="auto", 
                    choices=["auto", "producto", "ocr", "inventario", "comparacion", 
                            "fotografo", "dashboard", "documento", "espacio", 
                            "evento", "lugar", "objeto", "codigo", "arquitectura", "infra"])
    ap.add_argument("--context", default="laboral", 
                    choices=["laboral", "personal", "tecnico", "documento", "desconocido"])
    ap.add_argument("--detail", default="normal")
    ap.add_argument("--timeout", type=int, default=90)
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    # Ensure API key exists
    if not os.getenv("MINIMAX_API_KEY"):
        api_file = Path.home() / ".openclaw" / "workspace" / "minimaxapi.txt"
        if api_file.exists():
            os.environ["MINIMAX_API_KEY"] = api_file.read_text(encoding="utf-8", errors="ignore").strip()
        else:
            die("Falta MINIMAX_API_KEY (Coding Plan) en el entorno.", 2)

    image_path = str(Path(args.image).expanduser().resolve())
    if not Path(image_path).exists():
        die(f"No existe la imagen: {image_path}", 2)

    # Determinar el modo
    if args.mode == "auto":
        modo = detectar_modo(args.prompt)
    else:
        modo = args.mode

    # Obtener el prompt del modo
    prompt_final = args.prompt
    if args.context in CONFIG:
        if modo in CONFIG[args.context + "_modes"]:
            modo_config = CONFIG[args.context + "_modes"][modo]
            if isinstance(modo_config, dict) and "prompt" in modo_config:
                prompt_final = modo_config["prompt"] + "\n\n" + args.prompt

    print(f"Modo detectado: {modo} | Contexto: {args.context}", file=sys.stderr)

    env = os.environ.copy()
    env["MINIMAX_API_HOST"] = os.getenv("MINIMAX_API_HOST", "https://api.minimax.io")
    env["MINIMAX_MCP_BASE_PATH"] = os.getenv("MINIMAX_MCP_BASE_PATH", str(Path.home() / "Documents" / "mcp-output"))
    Path(env["MINIMAX_MCP_BASE_PATH"]).mkdir(parents=True, exist_ok=True)

    print("Iniciando MCP server...", file=sys.stderr)

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

        t_out = threading.Thread(target=stdout_reader, args=(proc, out_q, stop_event), daemon=True)
        t_err = threading.Thread(target=stderr_reader, args=(proc, err_buf, args.debug, stop_event), daemon=True)
        t_out.start()
        t_err.start()

        print("MCP iniciado. Enviando initialize...", file=sys.stderr)

        init_req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "clientInfo": {"name": "openclaw-vision-enhanced", "version": "3.0"},
                "capabilities": {}
            }
        }
        send(proc.stdin, init_req)

        init_resp = wait_for_id(out_q, 1, timeout_s=15.0)
        if not init_resp:
            print("Timeout esperando initialize.", file=sys.stderr)
            sys.exit(4)

        list_req = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
        send(proc.stdin, list_req)

        tools_resp = wait_for_id(out_q, 2, timeout_s=10.0)
        if tools_resp and "result" in tools_resp:
            tools = tools_resp["result"]
            if isinstance(tools, dict):
                tools = tools.get("tools") or tools.get("items") or []
            if isinstance(tools, list):
                names = [t.get("name") for t in tools if isinstance(t, dict) and t.get("name")]
                if names:
                    print(f"Tools: {', '.join(names)}", file=sys.stderr)

        data_url = make_data_url(image_path)
        print("Enviando understand_image...", file=sys.stderr)

        call_req = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "understand_image",
                "arguments": {
                    "prompt": f"{prompt_final}\nNivel de detalle: {args.detail}. Si dudás, decilo.",
                    "image_source": data_url
                }
            }
        }
        send(proc.stdin, call_req)

        call_resp = wait_for_id(out_q, 3, timeout_s=float(args.timeout))
        if not call_resp:
            print("Timeout en understand_image.", file=sys.stderr)
            sys.exit(5)

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
        cleanup_process(proc, debug=args.debug)


if __name__ == "__main__":
    main()
