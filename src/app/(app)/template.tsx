import { PageSlide } from "./page-slide";

/**
 * A template (not a layout) so Next remounts it on every navigation — that's
 * what lets PageSlide re-trigger the enter fade per page (tab changes: none).
 * The persistent nav dock stays in the layout above this, so it doesn't
 * re-animate; only page content transitions.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <PageSlide>{children}</PageSlide>;
}
