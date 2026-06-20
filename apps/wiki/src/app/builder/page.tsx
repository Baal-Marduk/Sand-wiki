import BuilderClient from "@/components/builder/BuilderClient";
// Imported at the page level (not only via the dynamically-loaded Builder) so the
// app-bar styling is present on first paint, before the ssr:false builder hydrates.
import "@/components/builder/builder.css";

export const metadata = {
  title: "Trampler Builder",
  description: "Interactive 3D blueprint builder for SAND tramplers.",
};

export default function BuilderPage() {
  return <BuilderClient />;
}
