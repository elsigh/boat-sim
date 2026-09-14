import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono, Share_Tech_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/site";
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
  metadataBase: new URL(SITE_URL),
  title: "boat-sim — Take the helm in the San Juan Islands",
  description: "Practice twin-screw docking, explore seven boat profiles, and find your next favorite approach. A free browser boat simulator built by a boater, with room for more crew.",
  openGraph: {
    siteName: "boat-sim",
    type: "website",
    images: [{ url: "/media/social-card.jpg", width: 1200, height: 630, alt: "boat-sim — Take the helm in the San Juan Islands" }],
  },
  twitter: { card: "summary_large_image", images: ["/media/social-card.jpg"] },
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
