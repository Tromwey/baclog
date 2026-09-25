import { ProfileSkeleton } from "@/components/skeletons/profile-skeleton";

/**
 * /perfil skeleton — your profile's own silhouette (perfil-screen.tsx), so
 * the first paint doesn't reflow. seguidores/ and siguiendo/ carry their own
 * loading.tsx: without them they'd inherit this one.
 */
export default function Loading() {
  return <ProfileSkeleton variant="own" />;
}
