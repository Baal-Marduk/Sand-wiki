"use client";

import { useState } from "react";
import { OTHER_OPTION } from "@/lib/proposal-schema";

/** A select of known values plus an "Other…" option that reveals a free-text
 *  input. The select posts `name`; the reveal posts `name__custom`. The server
 *  (resolveEnumSubmission) takes the custom value when OTHER_OPTION is chosen. */
export function EnumField({ field, value, options }: { field: string; value: string; options: string[] }) {
  const isKnown = value !== "" && options.includes(value);
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
          <option key={o} value={o}>{o}</option>
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
