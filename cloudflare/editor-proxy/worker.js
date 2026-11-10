/**
 * Puente de Cloudflare: impulsastudiodigital.com.ar/editor → editor de video (servicio impulsa-editor en Render).
 * Todo lo demás del dominio (la landing en Django) sigue yendo a su servidor como siempre.
 *
 * EDITOR_ORIGIN se configura en wrangler.toml (la dirección .onrender.com del servicio del editor).
 */

const PREFIX = "/editor";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // La ruta de Cloudflare es ".../editor*", que también agarra /editor-ia/ (página de Django): eso sigue de largo.
    const isEditor = url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`);
    if (!isEditor) return fetch(request);

    const origin = new URL(env.EDITOR_ORIGIN);
    const target = new URL(url.pathname + url.search, origin);

    const headers = new Headers(request.headers);
    headers.delete("Host"); // Render identifica el servicio por su propia dirección
    headers.set("X-Forwarded-Host", url.host);
    headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    // Si el editor responde con una redirección a su dirección interna, la pasamos a la pública.
    const location = response.headers.get("Location");
    if (location && location.startsWith(origin.origin)) {
      const fixed = new Response(response.body, response);
      fixed.headers.set("Location", url.origin + location.slice(origin.origin.length));
      return fixed;
    }
    return response;
  },
};
