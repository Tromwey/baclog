import { PeopleSkeleton } from "@/components/skeletons/people-skeleton";

/** /perfil/seguidores skeleton — the people list with "seguidores" lifted. */
export default function Loading() {
  return <PeopleSkeleton active="followers" />;
}
