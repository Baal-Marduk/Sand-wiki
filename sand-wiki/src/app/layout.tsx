import type { Metadata } from "next";
import Link from "next/link";
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
          <nav aria-label="Primary" className="max-w-5xl mx-auto flex gap-6 p-4">
            <Link href="/" className="font-bold">SAND Wiki</Link>
            <Link href="/items" className="underline-offset-4 hover:underline">Items</Link>
            <Link href="/tech" className="underline-offset-4 hover:underline">Tech Tree</Link>
            <Link href="/about" className="underline-offset-4 hover:underline ml-auto">About</Link>
          </nav>
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
