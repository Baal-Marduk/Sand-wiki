"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface SelectOption { value: string; label: string }

/** A single URL-driven dropdown. Selecting an option writes (or clears, for the empty
 *  "all"/default option) one search param and pushes the new URL; all other params are
 *  preserved. The server re-renders and performs the actual filtering/sorting. */
export function FilterSelect({
  name, label, value, options, allLabel,
}: {
  name: string;
  label: string;
  value?: string;
  options: SelectOption[];
  allLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(searchParams.toString());
    if (e.target.value) next.set(name, e.target.value);
    else next.delete(name);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-base-content/60">{label}</span>
      <select
        className="select select-sm select-bordered"
        value={value ?? ""}
        onChange={handleChange}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
