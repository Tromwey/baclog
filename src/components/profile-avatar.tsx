import { AuraField } from "@/components/ui/aura-field";

/**
 * F3.11 — the profile-sized identity disc (/perfil and /u/[username]): the
 * owner's photo when they have one, otherwise their ADN blooming as an orb
 * (the M3.5 recipe, unchanged). Server component; the orb is an AuraField.
 * `className` carries the size and the depth shadow — the disc itself only
 * knows it is round and clipped.
 */
export function ProfileAvatar({
  src,
  palette,
  seed,
  className = "",
}: {
  src: string | null;
  palette: string[];
  seed: number;
  className?: string;
}) {
  return (
    <div
      className={`relative flex-none overflow-hidden rounded-full bg-bg ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own route, fixed square, no optimizer needed
        <img
          src={src}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <AuraField variant="orb" colors={palette} seed={seed} />
      )}
    </div>
  );
}
