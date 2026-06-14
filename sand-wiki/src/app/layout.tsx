import type { Metadata } from "next";
import Link from "next/link";
import { Oswald } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SiteHeader } from "@/components/SiteHeader";
import { ConditionalChrome } from "@/components/ConditionalChrome";
import "./globals.css";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sand Help — Unofficial SAND: Raiders of Sophie Wiki",
  description: "A community, unofficial database for SAND: Raiders of Sophie.",
};

const DISCORD_URL = "https://discord.gg/sandgame";
const STEAM_URL =
  "https://store.steampowered.com/app/1431300/SAND_Raiders_of_Sophie/";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dark-only: `.dark` drives the shadcn token layer; color-scheme is set in CSS.
  return (
    <html lang="en" className={`dark ${oswald.variable}`}>
      <body className="min-h-screen bg-background text-foreground flex flex-col">
        <ConditionalChrome
          header={<SiteHeader />}
          footer={
            <footer className="border-t border-border text-sm text-muted-foreground">
              <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 text-center">
                <nav
                  aria-label="Footer"
                  className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
                >
                  <Link href="/about" className="text-primary underline-offset-2 hover:underline">
                    About
                  </Link>
                  <Link
                    href="/contribute/new"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Contribute
                  </Link>
                  <a
                    href={DISCORD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Discord ↗
                  </a>
                  <a
                    href={STEAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Get the game ↗
                  </a>
                </nav>

                <p className="text-xs leading-relaxed">
                  Unofficial fan site. Not affiliated with or endorsed by tinyBuild.
                  <br />
                  SAND: Raiders of Sophie is a trademark of its respective owners.
                </p>

                <p className="text-xs">© 2026 SAND HELP</p>
              </div>
            </footer>
          }
        >
          {children}
        </ConditionalChrome>
        <Analytics />
      </body>
    </html>
  );
}
