import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Multi-Agent Fact-Checking Copilot",
  description: "Fast, automated credibility assessment for social media. Driven by a Multi-Agent Parliament, our system extracts claims from screenshots and verifies them using RAG-powered semantic search against verified sources.",
  keywords: ["Multi-Agent Parliament", "Fact-Check AI", "RAG", "Social Media Verification", "Claim Extraction"],
  openGraph: {
    title: "Viral Claim Radar",
    description: "Multi-Agent Parliament driven fact-checking for social feeds. Verify claims with RAG-powered evidence.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
