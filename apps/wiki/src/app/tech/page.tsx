import { getTechTree } from "@/lib/queries";
import { TechTreeView } from "@/components/tech-tree/TechTreeView";

export const metadata = {
  title: "Tech Tree",
  description: "Interactive Trampler research tech tree for SAND: Raiders of Sophie.",
};

export default async function TechPage() {
  const tree = await getTechTree();
  return <TechTreeView tree={tree} />;
}
