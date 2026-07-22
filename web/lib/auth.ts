export const AUTH_COOKIE = "tc_auth";

/**
 * 共通パスワードから cookie 用のトークンを作る。
 * パスワードの平文を cookie に保存しないためのハッシュ化。
 */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`tokkun-calendar:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
