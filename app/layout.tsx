import type { Metadata } from "next";
import { MusicProvider } from "./components/MusicPlayer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "五笔测试网站",
    template: "%s · 五笔测试网站",
  },
  description: "专为 86 版五笔熟练用户设计的本地文章测速、字码挑战与离线查码工具。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <MusicProvider>{children}</MusicProvider>
      </body>
    </html>
  );
}
