import { describe, expect, it } from "vitest";

import { AUTH_COOKIE, sessionToken } from "../lib/auth";

describe("sessionToken", () => {
  it("同じパスワードからは同じトークンになる", async () => {
    expect(await sessionToken("secret")).toBe(await sessionToken("secret"));
  });

  it("違うパスワードでは違うトークンになる", async () => {
    expect(await sessionToken("alpha")).not.toBe(await sessionToken("beta"));
  });

  it("SHA-256のhex(64文字)を返す", async () => {
    expect(await sessionToken("secret")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("パスワードの平文を含まない", async () => {
    expect(await sessionToken("plaintext")).not.toContain("plaintext");
  });
});

describe("AUTH_COOKIE", () => {
  it("cookie名が定義されている", () => {
    expect(AUTH_COOKIE).toBeTruthy();
  });
});
