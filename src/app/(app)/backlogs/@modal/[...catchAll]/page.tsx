/**
 * Clears the zoom overlay on any deeper soft nav inside /backlogs (lentes/*,
 * [id]/card) — only the single-segment interception (.)[backlogId] renders a
 * modal; everything else must resolve the slot to null.
 */
export default function ClosedModalCatchAll() {
  return null;
}
