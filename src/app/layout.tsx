import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Helm typography. Condensed caps read like the engraved plates above a real
// panel; the mono is for lit numerals. next/font self-hosts both, so the
// desktop build still has them with no network.
const helmLabel = Barlow_Condensed({
  variable: "--font-helm-label",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const helmDigital = Share_Tech_Mono({
  variable: "--font-helm-digital",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "boatsim",
  description: "A Next.js + React Three Fiber docking simulator with boat profiles and maneuvering practice scenes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${helmLabel.variable} ${helmDigital.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
