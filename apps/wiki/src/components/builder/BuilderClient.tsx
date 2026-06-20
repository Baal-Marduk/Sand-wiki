"use client";
import dynamic from "next/dynamic";

// three.js can't server-render, so the builder is loaded client-only.
const Builder = dynamic(() => import("./Builder"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, opacity: 0.7 }}>Loading builder…</div>,
});

export default function BuilderClient() {
  return <Builder />;
}
