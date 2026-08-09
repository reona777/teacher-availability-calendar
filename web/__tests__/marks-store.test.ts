import { promises as fs } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadMarks, saveMark } from "../lib/marks-store";

const LOCAL_FILE = path.join(process.cwd(), ".data", "marks.json");
const REDIS_VARS = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

/** 開発中の `.data/marks.json` を壊さないよう退避してから試す。 */
let backup: string | null = null;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  backup = await fs.readFile(LOCAL_FILE, "utf8").catch(() => null);
  await fs.rm(LOCAL_FILE, { force: true });
  for (const name of REDIS_VARS) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const name of REDIS_VARS) {
    if (savedEnv[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = savedEnv[name];
    }
  }
  if (backup === null) {
    await fs.rm(LOCAL_FILE, { force: true });
  } else {
    await fs.writeFile(LOCAL_FILE, backup, "utf8");
  }
});

describe("ローカル保存（Redis未設定のとき）", () => {
  it("保存した印を読み戻せる", async () => {
    await saveMark("A|火|18:00", "ng");
    await saveMark("B|水|10:00", "ok");
    expect(await loadMarks()).toEqual({ "A|火|18:00": "ng", "B|水|10:00": "ok" });
  });

  it("nullで消せる", async () => {
    await saveMark("A|火|18:00", "ng");
    await saveMark("A|火|18:00", null);
    expect(await loadMarks()).toEqual({});
  });

  it("ファイルが無ければ空", async () => {
    expect(await loadMarks()).toEqual({});
  });

  it("壊れたファイルでも空として扱う", async () => {
    await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
    await fs.writeFile(LOCAL_FILE, "{ not json", "utf8");
    expect(await loadMarks()).toEqual({});
  });
});

describe("Redis保存（環境変数があるとき）", () => {
  function stubFetch(result: unknown) {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "token123";
    return fetchMock;
  }

  function sentInit(fetchMock: ReturnType<typeof stubFetch>): RequestInit {
    return fetchMock.mock.calls[0][1] as RequestInit;
  }

  function sentCommand(fetchMock: ReturnType<typeof stubFetch>): string[] {
    return JSON.parse(sentInit(fetchMock).body as string) as string[];
  }

  it("HGETALL の配列形式を読める", async () => {
    const fetchMock = stubFetch(["A|火|18:00", "ng"]);
    expect(await loadMarks()).toEqual({ "A|火|18:00": "ng" });
    expect(sentCommand(fetchMock)).toEqual(["HGETALL", "lesson-calendar:marks"]);
  });

  it("印の保存は HSET", async () => {
    const fetchMock = stubFetch(1);
    await saveMark("A|火|18:00", "ng");
    expect(sentCommand(fetchMock)).toEqual(["HSET", "lesson-calendar:marks", "A|火|18:00", "ng"]);
  });

  it("印の削除は HDEL", async () => {
    const fetchMock = stubFetch(1);
    await saveMark("A|火|18:00", null);
    expect(sentCommand(fetchMock)).toEqual(["HDEL", "lesson-calendar:marks", "A|火|18:00"]);
  });

  it("トークンをAuthorizationヘッダで送る", async () => {
    const fetchMock = stubFetch({});
    await loadMarks();
    const headers = sentInit(fetchMock).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token123");
  });

  it("失敗したら握りつぶさずエラーにする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "bad";
    await expect(loadMarks()).rejects.toThrow("401");
  });

  it("ローカルのファイルには書かない", async () => {
    stubFetch(1);
    await saveMark("A|火|18:00", "ng");
    await expect(fs.readFile(LOCAL_FILE, "utf8")).rejects.toThrow();
  });
});
