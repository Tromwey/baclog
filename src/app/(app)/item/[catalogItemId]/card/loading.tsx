import { CardExporterSkeleton } from "@/components/card-exporter-skeleton";

/**
 * The title's ticket card: the exporter's silhouette, headerless like the
 * page. Without this file it inherited the ficha's skeleton.
 */
export default function Loading() {
  return <CardExporterSkeleton />;
}
