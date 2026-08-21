import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE, sessionToken } from "./lib/auth";

/**
 * 共通パスワードによる閲覧保護。
 * SITE_PASSWORD が未設定の場合は誰も通さない（誤って公開状態になるのを防ぐ）。
 *
 * Next.js 16 で middleware から proxy に名前が変わったもの（役割は同じ）。
 */
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  const password = process.env.SITE_PASSWORD;
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (password && token && token === (await sessionToken(password))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
