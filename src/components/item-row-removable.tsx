"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type PointerEvent } from "react";
import { removeMembershipAction } from "@/app/actions/backlog-item-actions";
import { ItemRowReadonly, type ItemRowReadonlyProps } from "./item-row-readonly";

/**
 * Owner-only wrapper around the read-only shelf row that adds swipe-left → Quitar
 * (mobile gesture model, HANDOFF). Removes the title from THIS backlog only
 * (per-backlog membership); the shared read-only row stays presentational so the
 * public profile can keep using it untouched. Pointer-based so a horizontal drag
 * reveals the action while a plain tap still plays / opens the row.
 */
const REVEAL = 92; // px — width of the revealed "Quitar" action

export function ItemRowRemovable({
  backlogItemId,
  ...row
}: { backlogItemId: string } & ItemRowReadonlyProps) {
  const router = useRouter();
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [snapping, setSnapping] = useState(true); // animate except while dragging
  const [removing, setRemoving] = useState(false);
  const [, startTransition] = useTransition();
  const startX = useRef<number | null>(null);
  const startDx = useRef(0);
  const dragging = useRef(false);

  const settle = (nextOpen: boolean) => {
    setSnapping(true);
    setOpen(nextOpen);
    setDx(nextOpen ? -REVEAL : 0);
  };

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    startDx.current = open ? -REVEAL : 0;
    dragging.current = false;
  }
  function onPointerMove(e: PointerEvent) {
    if (startX.current === null) return;
    const raw = e.clientX - startX.current;
    // Ignore micro-moves so a tap on the row (play / open detail) still lands.
    if (!dragging.current) {
      if (Math.abs(raw) < 8) return;
      dragging.current = true;
      setSnapping(false); // follow the finger 1:1 while dragging
      // Capture so moves outside the element still track; guard because it can
      // throw (e.g. InvalidStateError) and must never abort the drag handler.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
    setDx(Math.max(-REVEAL, Math.min(0, raw + startDx.current)));
  }
  function onPointerUp() {
    if (startX.current === null) return;
    const wasDragging = dragging.current;
    startX.current = null;
    dragging.current = false;
    if (wasDragging) settle(dx < -REVEAL / 2);
  }

  function remove() {
    setRemoving(true);
    startTransition(async () => {
      try {
        await removeMembershipAction(backlogItemId);
        router.refresh();
      } catch {
        setRemoving(false);
        settle(false);
      }
    });
  }

  return (
    <div
      className="relative overflow-hidden"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${dx}px)`,
          transition: snapping ? "transform 180ms ease" : "none",
          touchAction: "pan-y",
        }}
        className={`flex ${removing ? "pointer-events-none opacity-40" : ""}`}
      >
        {/* Row content stays transparent so the backlog aura shows through and
            fades progressively — an opaque fill here cut the aura (regression). */}
        <div className="w-full flex-none">
          <ItemRowReadonly {...row} />
        </div>
        {/* The Quitar action rides just off the right edge (clipped by the outer
            overflow-hidden) until the swipe slides the whole track left to reveal
            it — a translating track, so no opaque cover is needed over the aura. */}
        <button
          type="button"
          onClick={remove}
          aria-label="Quitar de este backlog"
          tabIndex={open ? 0 : -1}
          className="flex w-[92px] flex-none items-center justify-center bg-hot font-mono text-[10px] uppercase tracking-[0.08em] text-white"
        >
          Quitar
        </button>
      </div>
      {open && (
        // Tap the revealed row (left of the action) to close it.
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => settle(false)}
          className="absolute inset-y-0 left-0 right-[92px] z-10"
        />
      )}
    </div>
  );
}
