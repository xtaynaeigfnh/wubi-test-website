import type { Metadata, Viewport } from "next";
import { HydrationBoundary } from "./components/HydrationBoundary";
import { MusicProvider } from "./components/MusicPlayer";
import { PwaProvider } from "./components/PwaControl";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      "https://wubi-typing-practice.xtaynaeigfnh.chatgpt.site",
  ),
  title: {
    default: "五笔测试网站",
    template: "%s · 五笔测试网站",
  },
  description: "专为 86 版五笔熟练用户设计的本地文章测速、错题复练、五码根专项与离线查码工具。",
  openGraph: {
    title: "五笔测试网站",
    description: "静流 · 节奏实验室、中文实战场与十四日训练。",
    type: "website",
    images: [{ url: `${basePath}/og.png`, width: 1536, height: 1024, alt: "五笔测试网站静流进阶训练" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "五笔测试网站",
    description: "静流 · 节奏实验室、中文实战场与十四日训练。",
    images: [`${basePath}/og.png`],
  },
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: `${basePath}/icon.svg`,
    apple: `${basePath}/icon.svg`,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e7edf0" },
    { media: "(prefers-color-scheme: dark)", color: "#09171a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <HydrationBoundary>
          <PwaProvider>
            <MusicProvider>{children}</MusicProvider>
          </PwaProvider>
        </HydrationBoundary>
      </body>
    </html>
  );
}
