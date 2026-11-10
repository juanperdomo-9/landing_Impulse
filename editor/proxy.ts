import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/paths";

/** Keeps the Supabase session fresh and sends signed-out visitors to /login. */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return NextResponse.next(); // accounts not configured yet: open mode

  // Paths here come without the /editor base path. Redirects use the public address: behind the
  // Cloudflare proxy, request.nextUrl carries the internal Render host.

  // A sign-in link that landed on the home page (Supabase "Site URL" fallback): finish it in /auth/callback.
  if (request.nextUrl.pathname === "/" && (request.nextUrl.searchParams.has("code") || request.nextUrl.searchParams.has("token_hash"))) {
    return NextResponse.redirect(publicUrl(`/auth/callback${request.nextUrl.search}`));
  }

  let response = NextResponse.next({ request });
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await sb.auth.getUser();

  const path = request.nextUrl.pathname;
  // "/" is the editor itself; "/editor" is its old address (redirects to "/")
  const protectedPage = path === "/" || ["/editor", "/cuenta", "/admin"].some((p) => path === p || path.startsWith(`${p}/`));
  if (!user && protectedPage) {
    return NextResponse.redirect(publicUrl(`/login?next=${encodeURIComponent(path)}`));
  }
  return response;
}

export const config = {
  matcher: ["/", "/editor/:path*", "/cuenta/:path*", "/admin/:path*", "/login"],
};
