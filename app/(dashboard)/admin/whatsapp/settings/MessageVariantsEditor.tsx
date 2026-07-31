"use client";

import { useState } from "react";

const SEPARATOR = "\n\n---\n\n";

const COLORS = [
  { label: "text-cyan-300",    border: "border-cyan-300/20",    bg: "bg-cyan-300/5"    },
  { label: "text-violet-300",  border: "border-violet-300/20",  bg: "bg-violet-300/5"  },
  { label: "text-emerald-300", border: "border-emerald-300/20", bg: "bg-emerald-300/5" },
  { label: "text-amber-300",   border: "border-amber-300/20",   bg: "bg-amber-300/5"   },
  { label: "text-rose-300",    border: "border-rose-300/20",    bg: "bg-rose-300/5"    },
];

interface Props {
  defaultValue: string;
}

export function MessageVariantsEditor({ defaultValue }: Props) {
  const initial = defaultValue
    .split(SEPARATOR)
    .map((v) => v.trim())
    .filter((v) => v !== "");

  const [variants, setVariants] = useState<string[]>(
    initial.length > 0 ? initial : [""]
  );

  const combined = variants.filter((v) => v.trim() !== "").join(SEPARATOR);

  const colStyle =
    "min-h-56 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300 resize-y placeholder:text-slate-600";

  function update(index: number, value: string) {
    setVariants((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function remove(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  function addVariant() {
    if (variants.length < 5) {
      setVariants((prev) => [...prev, ""]);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Hidden combined field for form submission */}
      <input name="messageVariants" type="hidden" value={combined} />

      <div className="flex flex-col gap-4">
        {variants.map((val, i) => {
          const c = COLORS[i % COLORS.length];
          return (
            <div
              key={i}
              className={`flex flex-col gap-2 rounded-lg border p-3 ${c.border} ${c.bg}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-widest ${c.label}`}>
                    Variant {i + 1}
                  </span>
                  <span className="text-xs text-slate-500">— randomly selected</span>
                </div>
                {variants.length > 1 && (
                  <button
                    className="rounded px-2 py-0.5 text-xs text-slate-500 transition hover:bg-rose-500/20 hover:text-rose-300"
                    onClick={() => remove(i)}
                    title="Remove this variant"
                    type="button"
                  >
                    ✕ Remove
                  </button>
                )}
              </div>
              <textarea
                className={colStyle}
                onChange={(e) => update(i, e.target.value)}
                placeholder={
                  i === 0
                    ? "Hi! We are from ATM Franchise. Apologies for the delay in responding. We are currently receiving a high volume of inquiries.\n\nPlease fill out your details quickly using this secure link:\n👉 {{formLink}}\nour team will contact you and provide complete information\nThank you!"
                    : `Paste your variant ${i + 1} message here…\nMake sure to include {{formLink}} somewhere!`
                }
                value={val}
              />
              <p className="text-right text-xs text-slate-600">{val.trim().length} chars</p>
            </div>
          );
        })}
      </div>

      {variants.length < 5 && (
        <button
          className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-2.5 text-sm text-slate-400 transition hover:border-cyan-300/40 hover:text-cyan-300"
          onClick={addVariant}
          type="button"
        >
          <span className="text-base leading-none">+</span>
          Add another variant
        </button>
      )}

      <p className="text-xs text-slate-500">
        Each box is one variant. Empty variants are skipped automatically.
        More variants = lower ban risk.
      </p>
    </div>
  );
}
