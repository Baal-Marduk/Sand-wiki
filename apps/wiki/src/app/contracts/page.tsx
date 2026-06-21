import { AdminBack } from "@/components/AdminBack";
import { ContractsClient } from "./ContractsClient";

export const metadata = {
  title: "Contracts — Sand Help",
};

export default function ContractsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AdminBack />
      <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide text-primary">Contracts</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Find a contract platform in the world, deliver the requested items into its slots, and a
        tiered reward drop comes in. These are the reward bundles + key-locked-box loot from the game files.
      </p>
      <ContractsClient />
    </div>
  );
}
