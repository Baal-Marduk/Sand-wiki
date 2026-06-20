import BuilderClient from "@/components/builder/BuilderClient";

export const metadata = {
  title: "Trampler Builder",
  description: "Interactive 3D blueprint builder for SAND tramplers.",
};

export default function BuilderPage() {
  return <BuilderClient />;
}
