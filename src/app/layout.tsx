import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  title: "Saleschat AI - 接客AIエージェント",
  description: "URLを入れるだけでAIチャットボットが完成。あなたの会社専用の接客担当チャットを作成します。",
  openGraph: {
    title: "Saleschat AI - 接客AIエージェント",
    description: "URLを入れるだけでAIチャットボットが完成。あなたの会社専用の接客担当チャットを作成します。",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Saleschat AI - AIによる営業/業務効率UP パーソナルアシスタント",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Saleschat AI - 接客AIエージェント",
    description: "URLを入れるだけでAIチャットボットが完成。あなたの会社専用の接客担当チャットを作成します。",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
