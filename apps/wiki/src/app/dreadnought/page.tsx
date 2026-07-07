import { DreadnoughtChecker } from "@/components/dreadnought/DreadnoughtChecker";

export const metadata = {
  title: "Dreadnought Predictor",
  description:
    "Storm Dive only. Count the cities on your map to predict whether it's a Dreadnought run — 9 cities means the Dreadnought is out there, 10 means the map is clear.",
};

export default function DreadnoughtPage() {
  return <DreadnoughtChecker />;
}
