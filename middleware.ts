import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") return NextResponse.next();

  const { response, user } = await updateSession(request);
  if (pathname === "/login" || pathname.startsWith("/login/") || pathname === "/api" || pathname.startsWith("/api/")) return response;
  if (user) return response;

  const redirect = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
