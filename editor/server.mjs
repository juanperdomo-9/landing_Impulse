/**
 * Servidor único de impulsastudiodigital.com.ar en Render:
 *   /editor…  → el editor (Next.js, con basePath /editor)
 *   todo lo demás → la landing, exportada como páginas fijas en sitio/ (python manage.py exportar_sitio)
 *
 * Producción: `npm start`. Para probar en local con la landing: `npm run build && npm start`.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

process.env.NODE_ENV ??= "production";
const { default: next } = await import("next");

const port = Number(process.env.PORT || 3000);
const dev = process.argv.includes("--dev");
const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

const SITIO = path.join(process.cwd(), "sitio");

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2",
};

// La landing se puede mostrar embebida en jpweb.com.ar (vista previa del portfolio), igual que con Django.
const FRAME_ANCESTORS = "frame-ancestors 'self' https://jpweb.com.ar https://*.onrender.com";

const esEditor = (p) => p === "/editor" || p.startsWith("/editor/");

/** Busca el archivo de la landing para una dirección; null si no existe (o si intenta salir de sitio/). */
async function archivoDeLanding(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.endsWith("/")) rel += "index.html";
  const archivo = path.normalize(path.join(SITIO, rel));
  if (!archivo.startsWith(SITIO + path.sep)) return null;
  try {
    const info = await stat(archivo);
    if (info.isFile()) return archivo;
    // "/editor-ia" sin barra final: carpeta con index.html
    if (info.isDirectory()) return { redirigirA: `${pathname}/` };
  } catch {
    return null;
  }
  return null;
}

async function servirLanding(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const encontrado = await archivoDeLanding(url.pathname);
  if (encontrado && typeof encontrado === "object") {
    res.writeHead(301, { Location: encontrado.redirigirA + url.search }).end();
    return;
  }
  if (!encontrado) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": FRAME_ANCESTORS });
    res.end('<!doctype html><meta charset="utf-8"><title>Página no encontrada</title><p style="font-family:sans-serif">Página no encontrada. <a href="/">Ir a Impulsa Studio</a></p>');
    return;
  }
  const ext = path.extname(encontrado).toLowerCase();
  const esHtml = ext === ".html";
  const cuerpo = await readFile(encontrado);
  res.writeHead(200, {
    "Content-Type": TIPOS[ext] ?? "application/octet-stream",
    "Content-Length": cuerpo.length,
    "Cache-Control": esHtml ? "no-cache" : "public, max-age=86400",
    ...(esHtml ? { "Content-Security-Policy": FRAME_ANCESTORS } : {}),
  });
  res.end(req.method === "HEAD" ? undefined : cuerpo);
}

await app.prepare();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (esEditor(url.pathname)) return handle(req, res);
    await servirLanding(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end("Error interno");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Impulsa Studio en http://localhost:${port} (landing en /, editor en /editor)`);
});
