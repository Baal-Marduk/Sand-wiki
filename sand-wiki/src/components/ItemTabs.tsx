"use client";

import { useState } from "react";

export interface Tab { id: string; label: string; content: React.ReactNode }

/** Client-component tabs with proper ARIA tablist/tabpanel structure.
 *  Tabs are in a <div role="tablist"> that only contains <button role="tab"> elements;
 *  the active content panel sits in a <div role="tabpanel"> outside the tablist. */
export function ItemTabs({ tabs }: { tabs: Tab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  if (tabs.length === 0) return null;
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const tabBase =
    "-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 font-display text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors";
  return (
    <div>
      <div role="tablist" className="flex border-b border-border-strong">
        {tabs.map((t) => {
          const isActive = t.id === activeId;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`tabpanel-${t.id}`}
              id={`tab-${t.id}`}
              className={`${tabBase} ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-card-elevated hover:text-foreground"
              }`}
              onClick={() => setActiveId(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab.id}`}
        aria-labelledby={`tab-${activeTab.id}`}
        className="pt-3"
      >
        {activeTab.content}
      </div>
    </div>
  );
}
