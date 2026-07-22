import { promises as fs } from "node:fs";
import path from "node:path";

import { fromRedisFlags, type Extras } from "./extra";
import { applyMark, fromRedisHash, sanitizeMarks, type MarkValue, type Marks } from "./marks";

/**
 * 手で足した情報（〇×の印・追加した講師）の保存先。
 * 本番は Vercel の Upstash Redis（環境変数が入る）。全員で同じ内容が見える。
 * 環境変数が無いローカル開発では `.data/` に書く（本番データを汚さないため）。
 */
const REDIS_KEY = "tokkun-calendar:marks";
const EXTRA_REDIS_KEY = "tokkun-calendar:extra";
const LOCAL_FILE = path.join(process.cwd(), ".data", "marks.json");
const EXTRA_LOCAL_FILE = path.join(process.cwd(), ".data", "extras.json");

type RedisEnv = { url: string; token: string };

/** Vercelの統合が入れる名前と、Upstash素の名前の両方を見る。 */
function redisEnv(): RedisEnv | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

/** Upstash の REST にコマンドをJSON配列で送る（パスに講師名を載せずに済む）。 */
async function command(env: RedisEnv, args: string[]): Promise<unknown> {
  const response = await fetch(env.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`印の保存先が ${response.status} を返しました`);
  }
  const body = (await response.json()) as { result?: unknown; error?: string };
  if (body.error) {
    throw new Error(body.error);
  }
  return body.result ?? null;
}

async function readLocal(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return {};
  }
}

async function writeLocal(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

export async function loadMarks(): Promise<Marks> {
  const env = redisEnv();
  if (env === null) {
    return sanitizeMarks(await readLocal(LOCAL_FILE));
  }
  return fromRedisHash(await command(env, ["HGETALL", REDIS_KEY]));
}

/** 印を1つだけ書き換える。フィールド単位で更新するので同時に触っても壊れない。 */
export async function saveMark(key: string, value: MarkValue | null): Promise<void> {
  const env = redisEnv();
  if (env === null) {
    const current = sanitizeMarks(await readLocal(LOCAL_FILE));
    await writeLocal(LOCAL_FILE, applyMark(current, key, value));
    return;
  }
  await command(
    env,
    value === null ? ["HDEL", REDIS_KEY, key] : ["HSET", REDIS_KEY, key, value],
  );
}

export async function loadExtras(): Promise<Extras> {
  const env = redisEnv();
  if (env === null) {
    return fromRedisFlags(await readLocal(EXTRA_LOCAL_FILE));
  }
  return fromRedisFlags(await command(env, ["HGETALL", EXTRA_REDIS_KEY]));
}

/** 手で足した講師を1件だけ追加・削除する。 */
export async function saveExtra(key: string, on: boolean): Promise<void> {
  const env = redisEnv();
  if (env === null) {
    const current = fromRedisFlags(await readLocal(EXTRA_LOCAL_FILE));
    if (on) {
      current[key] = true;
    } else {
      delete current[key];
    }
    await writeLocal(EXTRA_LOCAL_FILE, current);
    return;
  }
  await command(
    env,
    on ? ["HSET", EXTRA_REDIS_KEY, key, "1"] : ["HDEL", EXTRA_REDIS_KEY, key],
  );
}
