"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./builder.css";

// three.js can't server-render, so the viewer is loaded client-only.
const BuilderView = dynamic(() => import("./BuilderView"), {
  ssr: false,
  loading: () => <div className="bld-loading">Loading viewer…</div>,
});

// Same desktop threshold as the editor — the 3D viewer needs the room.
const MIN_WIDTH = 1024;

type Props = {
  buildCode: string;
  name: string;
  authorName: string | null;
  slug: string;
  likeCount: number;
  initialLiked: boolean;
  signedIn: boolean;
  canDelete: boolean;
};

export default function BuilderViewClient(props: Props) {
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
    return <div className="bld-loading">Loading viewer…</div>;
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
            This trampler opens in an interactive 3D viewer that needs a desktop
            or laptop. Open it on a screen at least {MIN_WIDTH}px wide.
          </p>
          <div className="bld-gate-links">
            <Link href="/gallery" className="bld-gate-btn primary">
              Browse the Gallery
            </Link>
            <Link href="/" className="bld-gate-btn ghost">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <BuilderView {...props} />;
}
