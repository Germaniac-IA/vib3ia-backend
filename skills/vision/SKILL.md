---
name: vision
description: Understand real-world photos using MiniMax Coding Plan (MCP understand_image).
metadata: {"clawdbot":{"emoji":"🦊","requires":{"bins":["uvx","python"]}}}
---

# Vision Enhanced (v2.2)

Analiza imágenes con inteligencia contextual.

## Modos

### OCR Estructurado
Extrae datos de facturas, recibos, documentos en JSON:

```bash
vision_enhanced --image "factura.jpg" --prompt "OCR estructurado"
```

### Inventario
Cuenta items en fotos:

```bash
vision_enhanced --image "deposito.jpg" --prompt "Cuantos productos hay?"
```

### Comparación (Antes/Después)
Compara dos imágenes:

```bash
vision_enhanced --image "foto_hoy.jpg" --prompt "Compará con la foto del lunes"
```

**Output:**
```json
{
  "lo_igual": ["estanteria", "cajas"],
  "lo_diferente": {
    "nuevos": ["3 botellas"],
    "eliminados": ["2 cajas"],
    "posicion": ["productos movidos"]
  },
  "resumen": "Hay cambios moderados"
}
```

### Modo Interactivo
```
vision_enhanced --image "imagen.jpg" --mode interactivo

Detectado: LABORAL
¿Qué necesitás?
  1. ocr → OCR estructurado
  2. inventario → Contar items
  3. comparacion → Antes/después
  4. crítica → Lo que funciona/mejora
  ...
```

## Uso

```bash
# Archivo local
python "skills/vision/vision.py" --image "foto.jpg"

# Desde URL (ej: imagen de Replicate)
python "skills/vision/vision.py" --image "https://replicate.delivery/xezq/..."

# Con prompt personalizado
python "skills/vision/vision.py" --image "foto.jpg" --prompt "Qué ves?"
```
