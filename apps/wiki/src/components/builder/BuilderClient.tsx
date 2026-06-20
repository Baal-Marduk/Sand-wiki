"use client";
import dynamic from "next/dynamic";
import "./builder.css";

// three.js can't server-render, so the builder is loaded client-only.
const Builder = dynamic(() => import("./Builder"), {
  ssr: false,
  loading: () => <div className="bld-loading">Loading builder…</div>,
});

export default function BuilderClient() {
  return <Builder />;
}
