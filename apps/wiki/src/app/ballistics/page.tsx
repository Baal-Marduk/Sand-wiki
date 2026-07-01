import { AdminBack } from "@/components/AdminBack";
import { SectionBanner } from "@/components/SectionBanner";
import { BallisticsClient } from "./BallisticsClient";

export const metadata = {
  title: "Ballistics — Sand Help",
};

export default function BallisticsPage() {
  return (
    <div className="pb-2">
      <SectionBanner
        eyebrow="Data"
        title="Ballistics Sheet"
        tagline="Admin · datamined weapon & turret figures — reload, range, penetration and per-ammo damage."
      />
      <AdminBack />
      <BallisticsClient />
    </div>
  );
}
