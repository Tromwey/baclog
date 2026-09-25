import { PeopleSkeleton } from "@/components/skeletons/people-skeleton";

/** /perfil/siguiendo skeleton — the people list with "siguiendo" lifted. */
export default function Loading() {
  return <PeopleSkeleton active="following" />;
}
