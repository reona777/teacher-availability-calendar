import { loadLocalEnv } from "./env";

const API_VERSION = "v62.0";
const SOAP_VERSION = "62.0";

/**
 * 接続先ホスト。My Domain を使っている組織は `<自分の組織>.my.salesforce.com` を
 * `SF_LOGIN_DOMAIN` に設定する。未設定なら Salesforce の共通ログインへ向ける。
 */
function loginDomain(): string {
  return process.env.SF_LOGIN_DOMAIN || "login.salesforce.com";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** SOAP APIでログインして sessionId を得る。 */
async function login(): Promise<string> {
  loadLocalEnv();
  const username = process.env.SF_USERNAME;
  const password = process.env.SF_PASSWORD;
  const token = process.env.SF_SECURITY_TOKEN ?? process.env.SF_TOKEN ?? "";
  if (!username || !password) {
    throw new Error("SF_USERNAME / SF_PASSWORD が設定されていません");
  }

  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"' +
    ' xmlns:urn="urn:partner.soap.sforce.com">' +
    "<soapenv:Body><urn:login>" +
    `<urn:username>${escapeXml(username)}</urn:username>` +
    `<urn:password>${escapeXml(password + token)}</urn:password>` +
    "</urn:login></soapenv:Body></soapenv:Envelope>";

  const response = await fetch(`https://${loginDomain()}/services/Soap/u/${SOAP_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "login" },
    body,
    cache: "no-store",
  });
  const text = await response.text();
  const matched = text.match(/<sessionId>([^<]+)<\/sessionId>/);
  if (!response.ok || !matched) {
    const fault = text.match(/<faultstring>([^<]*)<\/faultstring>/)?.[1];
    throw new Error(`Salesforceログインに失敗しました: ${fault ?? response.status}`);
  }
  return matched[1];
}

/** SOQLを実行して全レコードを返す（ページング対応・読み取り専用）。 */
export async function querySalesforce<T>(soql: string): Promise<T[]> {
  const sessionId = await login();
  const instance = `https://${loginDomain()}`;
  const records: T[] = [];
  let url: string | null =
    `${instance}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;

  while (url) {
    const response: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${sessionId}` },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Salesforceの取得に失敗しました: ${response.status}`);
    }
    const json = (await response.json()) as { records: T[]; nextRecordsUrl?: string };
    records.push(...json.records);
    url = json.nextRecordsUrl ? `${instance}${json.nextRecordsUrl}` : null;
  }
  return records;
}
