"use client";

import { useEffect, useState } from "react";

type Theme = "desertnight" | "desertday";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("desertnight");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) || "desertnight";
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "desertnight" ? "desertday" : "desertnight";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("sand-theme", next);
    } catch {
      /* ignore storage errors */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark theme"
      className="btn btn-ghost btn-circle text-lg"
    >
      <span aria-hidden="true">{mounted && theme === "desertday" ? "☀" : "☾"}</span>
    </button>
  );
}
