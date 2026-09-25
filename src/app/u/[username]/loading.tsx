import { ProfileSkeleton } from "@/components/skeletons/profile-skeleton";

/**
 * /u/[username] skeleton — the public profile's silhouette (page.tsx). The
 * shared collection ([backlogId]/) and the public ficha (item/[id]/) carry
 * their own loading.tsx: without them they'd inherit this profile.
 */
export default function Loading() {
  return <ProfileSkeleton variant="public" />;
}
