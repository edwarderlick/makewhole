import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "MAKEWHOLE — The next agent still gets paid.",
  description: "On-chain surety vault for a 3-hop agent pipeline on GenLayer Studio-dev.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`scroll-smooth ${space.variable} ${hanken.variable} ${mono.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background font-body-md text-body-md text-on-surface antialiased selection:bg-[#84cc16] selection:text-black" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
