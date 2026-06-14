import type { Metadata } from "next";
import Link from "next/link";
import { Oswald } from "next/font/google";
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
  title: "Unofficial SAND Wiki",
  description: "A community, unofficial database for SAND: Raiders of Sophie.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dark-only: `.dark` drives the shadcn token layer; color-scheme is set in CSS.
  return (
    <html lang="en" className={`dark ${oswald.variable}`}>
      <body className="min-h-screen bg-background text-foreground flex flex-col">
        <ConditionalChrome
          header={<SiteHeader />}
          footer={
            <footer className="border-t border-border text-sm text-muted-foreground p-4 text-center">
              <p>
                Unofficial fan site. Not affiliated with or endorsed by tinyBuild.{" "}
                <Link href="/about" className="text-primary underline underline-offset-2">
                  Learn more
                </Link>
                .
              </p>
            </footer>
          }
        >
          {children}
        </ConditionalChrome>
      </body>
    </html>
  );
}
