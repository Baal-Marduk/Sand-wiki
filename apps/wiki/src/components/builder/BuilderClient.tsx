"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./builder.css";

// three.js can't server-render, so the builder is loaded client-only.
const Builder = dynamic(() => import("./Builder"), {
  ssr: false,
  loading: () => <div className="bld-loading">Loading builder…</div>,
});

// Smallest width where the builder's fixed 300px + canvas + 324px layout fits
// with viewport room (the `lg` token). Below this we show a gate instead.
const MIN_WIDTH = 1024;

export default function BuilderClient() {
  // `null` until measured on the client, so neither the gate nor the builder
  // renders on the server / first paint based on a guessed width.
  const [wideEnough, setWideEnough] = useState<boolean | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => setWideEnough(window.innerWidth >= MIN_WIDTH);
    measure();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (wideEnough === null) {
    return <div className="bld-loading">Loading builder…</div>;
  }

  if (!wideEnough) {
    return (
      <div className="bld-gate">
        <div className="bld-gate-card">
          <span className="bld-gate-glyph" aria-hidden="true">
            ▦
          </span>
          <h1 className="bld-gate-title">Bigger screen needed</h1>
          <p className="bld-gate-text">
            The Trampler Builder is a 3D, multi-panel tool that needs a desktop
            or laptop. Open it on a screen at least {MIN_WIDTH}px wide.
          </p>
          <div className="bld-gate-links">
            <Link href="/gallery" className="bld-gate-btn primary">
              Browse the Gallery
            </Link>
            <Link href="/tech" className="bld-gate-btn">
              Open the Tech Tree
            </Link>
            <Link href="/" className="bld-gate-btn ghost">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <Builder />;
}
