"use client";

import { useState } from "react";
import { OTHER_OPTION, type SelectOption } from "@/lib/proposal-schema";

export function EnumField({ field, value, options }: { field: string; value: string; options: SelectOption[] }) {
  const isKnown = value !== "" && options.some((o) => o.value === value);
  const [sel, setSel] = useState(value === "" ? "" : isKnown ? value : OTHER_OPTION);
  return (
    <>
      <select
        name={field}
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="select select-bordered w-full"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        <option value={OTHER_OPTION}>Other…</option>
      </select>
      {sel === OTHER_OPTION && (
        <input
          name={`${field}__custom`}
          defaultValue={isKnown ? "" : value}
          placeholder="Type a new value"
          className="input input-bordered w-full mt-1"
        />
      )}
    </>
  );
}
