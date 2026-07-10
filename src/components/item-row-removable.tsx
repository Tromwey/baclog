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
      e.currentTarget.setPointerCapture(e.pointerId);
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
      className={`relative overflow-hidden ${
        removing ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <button
        type="button"
        onClick={remove}
        aria-label="Quitar de este backlog"
        tabIndex={open ? 0 : -1}
        className="absolute inset-y-0 right-0 flex w-[92px] items-center justify-center bg-hot font-mono text-[10px] uppercase tracking-[0.08em] text-white"
      >
        Quitar
      </button>
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
        className="relative bg-bg"
      >
        <ItemRowReadonly {...row} />
        {open && (
          // Tap the revealed row to close it instead of following the row link.
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => settle(false)}
            className="absolute inset-0 z-10"
          />
        )}
      </div>
    </div>
  );
}
