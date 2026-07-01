import { AdminBack } from "@/components/AdminBack";
import { SectionBanner } from "@/components/SectionBanner";
import { ContractsClient } from "./ContractsClient";

export const metadata = {
  title: "Contracts — Sand Help",
};

export default function ContractsPage() {
  return (
    <div className="pb-2">
      <SectionBanner
        eyebrow="Data"
        title="Contracts"
        tagline="Deliver the requested items into a contract platform's slots for a tiered reward drop — bundles and key-locked-box loot from the game files."
      />
      <AdminBack />
      <ContractsClient />
    </div>
  );
}
