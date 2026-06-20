import Link from "next/link";
import BuilderClient from "@/components/builder/BuilderClient";
// Imported at the page level (not only via the dynamically-loaded Builder) so the
// app bar is styled on first paint, before the ssr:false builder hydrates.
import "@/components/builder/builder.css";

export const metadata = {
  title: "Trampler Builder",
  description: "Interactive 3D blueprint builder for SAND tramplers.",
};

export default function BuilderPage() {
  return (
    <div className="bld-app">
      <header className="bld-appbar">
        <Link
          href="/"
          aria-label="SAND HELP — home"
          className="group font-display text-xl font-bold tracking-wide text-foreground transition-colors hover:text-primary focus-visible:text-primary"
        >
          SAND
          <span
            aria-hidden="true"
            className="mx-0.5 text-primary transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
          >
            ·
          </span>
          HELP
        </Link>
        <span className="bld-page-title">Trampler Builder</span>
      </header>
      <div className="bld-body">
        <BuilderClient />
      </div>
    </div>
  );
}
