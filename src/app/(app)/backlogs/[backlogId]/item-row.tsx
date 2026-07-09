"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { removeItemAction, setStatusAction } from "@/app/actions/backlog-item-actions";
import { CrossMediaFeedback } from "@/components/cross-media-feedback";
import { ReactionPicker } from "@/components/reaction-picker";
import type { BacklogItemWithCatalog } from "@/modules/backlog/queries";

const STATUS_LABEL: Record<string, string> = {
  on_my_radar: "On my radar",
  in_progress: "In progress",
  completed: "Completed",
};

const STATUS_STYLE: Record<string, string> = {
  on_my_radar: "bg-surface-2 text-text-2",
  in_progress: "bg-fuchsia-900/60 text-fuchsia-200",
  completed: "bg-emerald-900/60 text-emerald-200",
  custom: "bg-sky-900/60 text-sky-200",
};

export function ItemRow({ item }: { item: BacklogItemWithCatalog }) {
  const [picking, setPicking] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [reaction, setReaction] = useState(item.reaction);
  const [pending, startTransition] = useTransition();

  const statusLabel =
    item.status === "custom"
      ? (item.customStatusLabel ?? "Custom")
      : STATUS_LABEL[item.status];

  function pick(status: "on_my_radar" | "in_progress" | "completed") {
    setPicking(false);
    startTransition(() =>
      setStatusAction(item.id, status)
        .then(() => {})
        .catch(() => {}),
    );
  }

  function pickCustom() {
    const label = customDraft.trim();
    if (!label) return;
    setPicking(false);
    setCustomDraft("");
    startTransition(() =>
      setStatusAction(item.id, "custom", label)
        .then(() => {})
        .catch(() => {}),
    );
  }

  return (
    <div className="rounded-xl bg-surface-1 p-2.5">
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
            <div className="flex h-16 w-12 items-center justify-center rounded-md bg-surface-2">
              {item.mediaType === "album" ? "♫" : "▶"}
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/item/${item.catalogItemId}`}>
            <p className="truncate font-medium">{item.title}</p>
          </Link>
          <p className="truncate text-xs text-text-3">
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
            startTransition(() =>
              removeItemAction(item.id)
                .then(() => {})
                .catch(() => {}),
            )
          }
          disabled={pending}
          aria-label={`Quitar ${item.title}`}
          className="px-1 text-text-3 hover:text-text-2"
        >
          ✕
        </button>
      </div>

      {picking && (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          <div className="flex flex-wrap gap-1.5">
            {(["on_my_radar", "in_progress", "completed"] as const).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => pick(s)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${STATUS_STYLE[s]} ${
                    item.status === s ? "ring-1 ring-accent" : ""
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
              className="min-w-0 flex-1 rounded-full border border-line bg-bg px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
            <button
              onClick={pickCustom}
              disabled={!customDraft.trim()}
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-40"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Reacción — no me gusta / me gusta / me obsesiona. Aplica en cualquier
          status: la obsesión puede surgir antes de terminar algo. */}
      <div className="mt-2 border-t border-line pt-2">
        <ReactionPicker
          backlogItemId={item.id}
          reaction={reaction}
          variant="tinted"
          onChange={setReaction}
        />
      </div>

      {reaction && item.sourceCrossMediaRecId && (
        <div className="mt-2 border-t border-line pt-2">
          <CrossMediaFeedback
            backlogItemId={item.id}
            reaction={reaction}
            sourceCrossMediaRecId={item.sourceCrossMediaRecId}
            variant="plain"
          />
        </div>
      )}
    </div>
  );
}
