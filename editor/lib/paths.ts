/**
 * Where the editor lives: impulsastudiodigital.com.ar/editor.
 *
 * Next.js adds BASE_PATH by itself to <Link>, redirect() and the router. Plain URLs do not get it:
 * fetch(), <img src>, <form action>, Web Workers and absolute redirects built in route handlers.
 * Those use withBase() / publicUrl() below.
 *
 * Keep BASE_PATH in sync with basePath in next.config.ts.
 */
export const BASE_PATH = "/editor";

/** Public address of the website the editor is served under (no trailing slash, no /editor). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://impulsastudiodigital.com.ar").replace(/\/+$/, "");

/** An app path ("/api/copy") as the browser must request it ("/editor/api/copy"). */
export const withBase = (path: string) =>
  path === "/" || path.startsWith("/?") ? `${BASE_PATH}${path.slice(1)}` : `${BASE_PATH}${path}`; // "/?p=1" -> "/editor?p=1"

/**
 * Absolute public URL of an app path. Route handlers use it instead of req.url, because behind
 * Render's proxy req.url may carry the internal address, not the visitor's one.
 */
export const publicUrl = (path: string) => `${SITE_URL}${BASE_PATH}${path}`;

/** Keeps a `next` parameter inside the app (an app path such as "/" or "/cuenta"). */
export const safeNext = (next: string | null | undefined, fallback = "/") =>
  next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
