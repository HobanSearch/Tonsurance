import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://tonsurance.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tonsurance | Parametric Risk Coverage on TON Blockchain",
  description: "Automated parametric risk coverage on TON blockchain. Get protection for stablecoin depegs, smart contract exploits, oracle failures, and bridge incidents. Payouts in 5-10 minutes.",
  keywords: ["parametric insurance", "TON blockchain", "DeFi coverage", "smart contract insurance", "crypto risk protection", "stablecoin depeg", "bridge security"],
  authors: [{ name: "Tonsurance" }],
  openGraph: {
    title: "Tonsurance | Parametric Risk Coverage on TON Blockchain",
    description: "Automated parametric risk coverage on TON blockchain. Payouts in 5-10 minutes. No claims process needed.",
    url: siteUrl,
    siteName: "Tonsurance",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Tonsurance - Parametric Risk Coverage",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tonsurance | Parametric Risk Coverage on TON Blockchain",
    description: "Automated payouts in 5-10 minutes. No claims process needed.",
    images: ["/og-image.png"],
    creator: "@tonsurance",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
