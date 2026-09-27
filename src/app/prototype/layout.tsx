import { notFound } from "next/navigation";

/**
 * The card lab is a development tool, not a product surface: it drew the
 * cards with sample data and no session, so in production it was a public
 * URL showing placeholder handles and old designs. It 404s in any production
 * build (prod, beta and previews all run NODE_ENV=production) — the same
 * `notFound()` as a route that doesn't exist, no admin gate needed because
 * nothing in it is worth reaching on a deployment.
 */
export default function PrototypeLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
