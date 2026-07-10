"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Tap vs. long-press discrimination over Pointer Events (HANDOFF §8: the
 * progress button is tap → en progreso · mantener presionado → completado).
 *
 * - pointerdown starts the timer; if it fires, `onLongPress` runs once (with a
 *   small `navigator.vibrate` haptic where supported) and the subsequent
 *   pointerup is swallowed — a long-press never also taps.
 * - pointerup before the threshold → `onTap` — but ONLY for a press that is
 *   still armed (`pressing`): a valid pointerdown arms it; leave/cancel/up
 *   disarm it. So a leave → re-enter → release, or a release with no matching
 *   press, never taps.
 * - pointerleave / pointercancel → abandon the PENDING press (no tap, no
 *   long-press) but keep `firedLongPress` set: leaving and re-entering after a
 *   long-press already fired must not turn the release into a tap. Only
 *   pointerup consumes the flag; pointerdown re-arms it for the next press.
 * - Non-primary pointers (multi-touch extras, non-left mouse buttons) are
 *   ignored entirely on BOTH ends — a right-click hold must not complete an
 *   item, and a right-click release (or a secondary finger lifting) must not
 *   tap.
 *
 * IMPORTANT for consumers: the target element needs
 *   `touch-action: manipulation` (kills the 300ms delay + double-tap zoom so
 *   the browser doesn't eat the gesture) and
 *   `-webkit-touch-callout: none` (stops iOS Safari's press-and-hold callout
 *   from hijacking the long-press). Also consider `select-none` so the hold
 *   doesn't start a text selection.
 */
export function useLongPress(
  onTap: () => void,
  onLongPress: () => void,
  { threshold = 500 }: { threshold?: number } = {},
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLongPress = useRef(false);
  // Armed by a VALID pointerdown only; disarmed by leave/cancel and up.
  const pressing = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      pressing.current = true;
      firedLongPress.current = false;
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        firedLongPress.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, threshold);
    },
    [clear, onLongPress, threshold],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Same guard as pointerdown, plus the arm check: only the release of a
      // press we actually armed may tap.
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (!pressing.current) return;
      pressing.current = false;
      clear();
      if (!firedLongPress.current) onTap();
      firedLongPress.current = false;
    },
    [clear, onTap],
  );

  // Leaving or cancelling mid-press abandons the pending gesture (disarms
  // `pressing`, so a later re-enter + release can't tap) — but does NOT reset
  // firedLongPress, so a leave + re-enter release can't double-fire.
  const onPointerLeave = useCallback(() => {
    pressing.current = false;
    clear();
  }, [clear]);

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel: onPointerLeave,
  };
}
