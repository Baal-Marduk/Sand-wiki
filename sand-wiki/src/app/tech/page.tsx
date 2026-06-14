import { getTechTree } from "@/lib/queries";
import { TechTreeView } from "@/components/tech-tree/TechTreeView";

export const metadata = { title: "Tech Tree — SAND Wiki" };

export default async function TechPage() {
  const tree = await getTechTree();
  return <TechTreeView tree={tree} />;
}
