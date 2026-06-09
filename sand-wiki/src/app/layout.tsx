import type { Metadata } from "next";
import Link from "next/link";
import { MainNav } from "@/components/MainNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unofficial SAND Wiki",
  description: "A community, unofficial database for SAND: Raiders of Sofia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
        <header className="border-b border-neutral-800">
          <MainNav />
        </header>
        <main className="max-w-5xl mx-auto w-full p-4 flex-1">{children}</main>
        <footer className="border-t border-neutral-800 text-sm text-neutral-400 p-4 text-center">
          Unofficial fan site. Not affiliated with or endorsed by tinyBuild.{" "}
          <Link href="/about" className="underline">Learn more</Link>.
        </footer>
      </body>
    </html>
  );
}
