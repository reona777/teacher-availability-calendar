import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE, sessionToken } from "../../lib/auth";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = Boolean(process.env.SITE_PASSWORD);

  async function login(formData: FormData) {
    "use server";
    const password = process.env.SITE_PASSWORD;
    const input = String(formData.get("password") ?? "");
    if (!password || input !== password) {
      redirect("/login?error=1");
    }
    const store = await cookies();
    store.set(AUTH_COOKIE, await sessionToken(password), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
      secure: process.env.NODE_ENV === "production",
    });
    redirect("/");
  }

  return (
    <main className="login">
      <h1>授業カレンダー</h1>
      {process.env.SITE_NAME ? <p className="sub">{process.env.SITE_NAME}</p> : null}
      {configured ? null : (
        <p className="error">SITE_PASSWORD が未設定です。環境変数を設定してください。</p>
      )}
      {error ? <p className="error">パスワードが違います。</p> : null}
      <form action={login}>
        <input type="password" name="password" placeholder="パスワード" autoComplete="current-password" />
        <button type="submit">開く</button>
      </form>
    </main>
  );
}
