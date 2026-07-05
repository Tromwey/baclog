"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  removeItemAction,
  setRatingAction,
  setStatusAction,
} from "@/app/actions/backlog-item-actions";
import type { BacklogItemWithCatalog } from "@/modules/backlog/queries";

const STATUS_LABEL: Record<string, string> = {
  on_my_radar: "On my radar",
  obsessing_over: "Obsessing over",
  completed: "Completed",
};

const STATUS_STYLE: Record<string, string> = {
  on_my_radar: "bg-neutral-800 text-neutral-300",
  obsessing_over: "bg-fuchsia-900/60 text-fuchsia-200",
  completed: "bg-emerald-900/60 text-emerald-200",
  custom: "bg-sky-900/60 text-sky-200",
};

export function ItemRow({ item }: { item: BacklogItemWithCatalog }) {
  const [picking, setPicking] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const statusLabel =
    item.status === "custom"
      ? (item.customStatusLabel ?? "Custom")
      : STATUS_LABEL[item.status];

  function pick(status: "on_my_radar" | "obsessing_over" | "completed") {
    setPicking(false);
    startTransition(() => setStatusAction(item.id, status).then(() => {}));
  }

  function pickCustom() {
    const label = customDraft.trim();
    if (!label) return;
    setPicking(false);
    setCustomDraft("");
    startTransition(() =>
      setStatusAction(item.id, "custom", label).then(() => {}),
    );
  }

  return (
    <div className="rounded-xl bg-neutral-900 p-2.5">
      <div className="flex items-center gap-3">
        <Link href={`/item/${item.catalogItemId}`} className="shrink-0">
          {item.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
            <img
              src={item.posterUrl}
              alt=""
              className="h-16 w-12 rounded-md object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-16 w-12 items-center justify-center rounded-md bg-neutral-800">
              {item.mediaType === "album" ? "♫" : "▶"}
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/item/${item.catalogItemId}`}>
            <p className="truncate font-medium">{item.title}</p>
          </Link>
          <p className="truncate text-xs text-neutral-500">
            {[item.byline, item.year].filter(Boolean).join(" · ")}
          </p>
          <button
            onClick={() => setPicking(!picking)}
            disabled={pending}
            className={`mt-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[item.status]} disabled:opacity-50`}
          >
            {statusLabel} ▾
          </button>
        </div>
        <button
          onClick={() =>
            startTransition(() => removeItemAction(item.id).then(() => {}))
          }
          disabled={pending}
          aria-label={`Quitar ${item.title}`}
          className="px-1 text-neutral-600 hover:text-neutral-300"
        >
          ✕
        </button>
      </div>

      {picking && (
        <div className="mt-2 space-y-2 border-t border-neutral-800 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {(["on_my_radar", "obsessing_over", "completed"] as const).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => pick(s)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${STATUS_STYLE[s]} ${
                    item.status === s ? "ring-1 ring-neutral-400" : ""
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ),
            )}
          </div>
          <div className="flex gap-1.5">
            <input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              maxLength={30}
              placeholder="Estado propio…"
              className="min-w-0 flex-1 rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs outline-none focus:border-neutral-400"
            />
            <button
              onClick={pickCustom}
              disabled={!customDraft.trim()}
              className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-900 disabled:opacity-40"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {item.status === "completed" && (
        <div className="mt-2 flex gap-1 border-t border-neutral-800 pt-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              disabled={pending}
              onClick={() =>
                startTransition(() => setRatingAction(item.id, n).then(() => {}))
              }
              aria-label={`${n} estrellas`}
              className={`text-lg ${
                (item.rating ?? 0) >= n ? "text-amber-300" : "text-neutral-700"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
