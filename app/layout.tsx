import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Resolve AI｜企业智能服务台",
    description: "可检索、可执行、可追踪的企业知识库与工单处理 Agent",
    openGraph: { title: "Resolve AI｜企业智能服务台", description: "可检索、可执行、可追踪", images: [image] },
    twitter: { card: "summary_large_image", title: "Resolve AI｜企业智能服务台", description: "可检索、可执行、可追踪", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${geist.variable} ${mono.variable}`}>{children}</body></html>;
}
