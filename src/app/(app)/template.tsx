import { PageSlide } from "./page-slide";

/**
 * A template (not a layout) so Next remounts it on every navigation — that's
 * what lets PageSlide re-trigger the carousel/fade enter animation per page.
 * The persistent aura + nav dock stay in the layout above this, so they don't
 * re-animate; only page content transitions.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <PageSlide>{children}</PageSlide>;
}
