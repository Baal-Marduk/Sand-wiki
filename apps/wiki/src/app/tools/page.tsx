import { SectionPlaceholder } from "@/components/SectionPlaceholder";

export const metadata = {
  title: "Tools",
  description: "Tools and utilities for SAND: Raiders of Sophie.",
};

export default function ToolsPage() {
  return (
    <SectionPlaceholder
      sectionSlug="tools"
      note="The tech-tree cost calculator has been retired because the underlying tech-tree data isn't available in the current game files. Tools will return once there's data to support them."
    />
  );
}
