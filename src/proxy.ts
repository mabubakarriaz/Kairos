import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifySession } from "@/lib/auth-session";

/**
 * Single-user password gate. Every non-static request is held at `/login`
 * until a signed session cookie verifies. Already-authed users visiting
 * `/login` are bounced back to the schedule.
 *
 * Fails closed: with AUTH_SECRET unset, verifySession returns false for any
 * value, so the only reachable surface is `/login` itself.
 */

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico).*)"],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPath = pathname === "/login";

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  const authed = await verifySession(cookie);

  if (!authed && !isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (authed && isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
