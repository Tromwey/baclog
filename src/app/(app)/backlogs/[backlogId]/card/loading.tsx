import { CardExporterSkeleton } from "@/components/card-exporter-skeleton";

/**
 * The collection's receipt card: the exporter's silhouette with its header
 * (the page passes eyebrow + subtitle). Without this file it inherited the
 * collection's skeleton — a different screen, and one that hides the dock.
 */
export default function Loading() {
  return <CardExporterSkeleton header />;
}
