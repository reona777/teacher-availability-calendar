import type { Metadata } from "next";

import "./globals.css";

const siteName = process.env.SITE_NAME;

export const metadata: Metadata = {
  title: siteName ? `特訓カレンダー | ${siteName}` : "特訓カレンダー",
  description: "講師の特訓枠と空きを一覧する",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
