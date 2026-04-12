import path from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const imagePath = arg("--image");
const prompt =
  arg("--prompt") ??
  "Describí la imagen con detalle. Indicá qué ves, qué NO podés confirmar y terminá con acciones concretas.";
const detail = arg("--detail") ?? "normal";

if (!imagePath) {
  console.error('Uso: node vision_mcp.js --image "C:\\ruta\\foto.jpg"');
  process.exit(2);
}

if (!process.env.MINIMAX_API_KEY) {
  console.error("Falta MINIMAX_API_KEY (Coding Plan).");
  process.exit(2);
}

const absImage = path.resolve(imagePath);

async function main() {
  const transport = new StdioClientTransport({
    command: "uvx",
    args: ["minimax-coding-plan-mcp", "-y"],
    env: {
      ...process.env,
      MINIMAX_API_HOST: process.env.MINIMAX_API_HOST ?? "https://api.minimax.io",
    },
  });

  const client = new Client(
    { name: "openclaw-vision", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  const tools = await client.listTools();
  if (!tools.tools?.some(t => t.name === "understand_image")) {
    console.error("No está la tool understand_image (¿MCP correcto?)");
    process.exit(3);
  }

  const res = await client.callTool({
    name: "understand_image",
    arguments: {
      prompt: `${prompt}\nNivel de detalle: ${detail}. Si dudás, decilo.`,
      image_source: absImage,
    },
  });

  if (res?.content?.length) {
    for (const c of res.content) {
      if (c.type === "text") console.log(c.text);
      else console.log(JSON.stringify(c));
    }
  } else {
    console.log(JSON.stringify(res, null, 2));
  }

  await client.close();
}

main().catch(e => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});

