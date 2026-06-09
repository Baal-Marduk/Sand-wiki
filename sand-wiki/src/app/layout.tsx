import type { Metadata } from "next";
import Link from "next/link";
import { Oswald } from "next/font/google";
import { MainNav } from "@/components/MainNav";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-oswald", display: "swap" });

export const metadata: Metadata = {
  title: "Unofficial SAND Wiki",
  description: "A community, unofficial database for SAND: Raiders of Sophie.",
};

const themeInit = `(function(){try{var t=localStorage.getItem('sand-theme');if(t==='desertday'||t==='desertnight'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="desertnight" className={oswald.variable}>
      <body className="min-h-screen bg-base-100 text-base-content flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <header className="border-b border-base-300">
          <MainNav />
        </header>
        <main className="max-w-5xl mx-auto w-full p-4 flex-1">{children}</main>
        <footer className="footer footer-center border-t border-base-300 text-sm text-base-content/70 p-4">
          <p>
            Unofficial fan site. Not affiliated with or endorsed by tinyBuild.{" "}
            <Link href="/about" className="link">Learn more</Link>.
          </p>
        </footer>
      </body>
    </html>
  );
}
