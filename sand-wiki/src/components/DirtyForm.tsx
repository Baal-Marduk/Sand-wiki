"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { btnPrimary } from "@/components/form-styles";

/** Fields that don't count as a "change" on their own: the optional source note
 *  documents an edit, it isn't itself a correction. Hidden fields (type/slug/role)
 *  are constant, so they never affect the diff. */
const IGNORED_FIELDS = new Set(["note"]);

// Default true so a stray consumer outside a DirtyForm fails open (button enabled).
const DirtyContext = createContext(true);

/** True once the form's current values differ from their initial state. */
export function useFormDirty() {
  return useContext(DirtyContext);
}

function serialize(form: HTMLFormElement): string {
  const parts: string[] = [];
  for (const [k, v] of new FormData(form)) {
    if (IGNORED_FIELDS.has(k)) continue;
    parts.push(`${k}=${typeof v === "string" ? v : v.name}`);
  }
  return parts.join("\n");
}

/** Drop-in replacement for `<form action={…}>` that tracks whether anything has
 *  changed since mount and exposes it via `useFormDirty()`. Works for uncontrolled
 *  (defaultValue) and controlled forms alike: input/change events catch value edits,
 *  and a MutationObserver catches structural changes (rows added/removed). */
export function DirtyForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const initialRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    initialRef.current = serialize(form);
    const recheck = () => setDirty(serialize(form) !== initialRef.current);
    form.addEventListener("input", recheck);
    form.addEventListener("change", recheck);
    const observer = new MutationObserver(recheck);
    observer.observe(form, { childList: true, subtree: true });
    return () => {
      form.removeEventListener("input", recheck);
      form.removeEventListener("change", recheck);
      observer.disconnect();
    };
  }, []);

  return (
    <form ref={formRef} action={action} className={className}>
      <DirtyContext.Provider value={dirty}>{children}</DirtyContext.Provider>
    </form>
  );
}

/** Submit button that stays disabled until its enclosing DirtyForm is dirty. */
export function DirtySubmit({
  children,
  className = btnPrimary,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const dirty = useFormDirty();
  return (
    <button type="submit" className={className} disabled={!dirty}>
      {children}
    </button>
  );
}
