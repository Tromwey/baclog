import { requireUser } from "@/auth";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg px-4 pb-16 pt-8 text-text">
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
