import type { Metadata } from "next";

import "./globals.css";

const siteName = process.env.SITE_NAME;

export const metadata: Metadata = {
  title: siteName ? `授業カレンダー | ${siteName}` : "授業カレンダー",
  description: "講師の授業枠と空きを一覧する",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
