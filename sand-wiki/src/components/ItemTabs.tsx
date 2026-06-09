import { Fragment } from "react";

export interface Tab { id: string; label: string; content: React.ReactNode }

/** CSS-only radio tabs (DaisyUI). Server-component friendly, no JS, keyboard-navigable.
 *  The first tab is checked by default. Returns null when there are no tabs. */
export function ItemTabs({ tabs, name = "item-tabs" }: { tabs: Tab[]; name?: string }) {
  if (tabs.length === 0) return null;
  return (
    <div role="tablist" className="tabs tabs-border">
      {tabs.map((t, i) => (
        <Fragment key={t.id}>
          <input
            type="radio"
            name={name}
            role="tab"
            className="tab"
            aria-label={t.label}
            defaultChecked={i === 0}
          />
          <div role="tabpanel" className="tab-content pt-3">
            {t.content}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
