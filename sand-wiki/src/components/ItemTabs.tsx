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
  return (
    <div>
      <div role="tablist" className="tabs tabs-border">
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
              className={`tab${isActive ? " tab-active" : " text-base-content/75"}`}
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
