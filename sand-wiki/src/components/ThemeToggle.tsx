"use client";

// Toggles the document theme directly (no React state) and persists it.
// The sun/moon icon is swapped purely via CSS on [data-theme] (see globals.css),
// so it always matches the actual theme — including the anti-FOUC init script —
// with no hydration mismatch and no setState-in-effect.
export function ThemeToggle() {
  function toggle() {
    const current = document.documentElement.dataset.theme === "desertday" ? "desertday" : "desertnight";
    const next = current === "desertnight" ? "desertday" : "desertnight";
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
      <span aria-hidden="true" className="theme-icon-night">☾</span>
      <span aria-hidden="true" className="theme-icon-day">☀</span>
    </button>
  );
}
