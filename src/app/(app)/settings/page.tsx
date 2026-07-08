import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/auth";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-dock-clearance pt-8 text-text">
      <Link
        href="/perfil"
        className="mb-4 -ml-1 inline-flex items-center gap-1 text-sm text-text-2 transition-colors hover:text-text"
      >
        <ChevronLeft size={18} /> Perfil
      </Link>
      <h1 className="font-display text-2xl font-bold tracking-[-0.01em]">Ajustes</h1>
      <SettingsForm
        initialName={user.name ?? ""}
        initialService={user.preferredService}
        email={user.email}
        initialUsername={user.username}
        initialIsPublic={user.isPublic}
      />
    </main>
  );
}
