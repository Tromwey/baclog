/**
 * Clears the zoom overlay when soft-navigating back to /backlogs itself
 * (e.g. deleteBacklogAction's redirect). Without an explicit match the slot
 * would keep its previous (intercepted) state — see parallel-routes docs.
 */
export default function ClosedModal() {
  return null;
}
