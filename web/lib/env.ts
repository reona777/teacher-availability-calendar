import fs from "node:fs";
import path from "node:path";

let loaded = false;

/**
 * ローカル開発用に web/.env.local を読み込む。
 * 本番（Vercel）は環境変数が設定済みなので何もしない。
 */
export function loadLocalEnv(): void {
  if (loaded || process.env.SF_USERNAME) {
    loaded = true;
    return;
  }
  loaded = true;

  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const matched = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (matched && !process.env[matched[1]]) {
      process.env[matched[1]] = matched[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
