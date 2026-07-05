import { requireUser } from "@/auth";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-neutral-950 px-4 pb-16 pt-8 text-neutral-100">
      <h1 className="text-xl font-bold">Ajustes</h1>
      <SettingsForm
        initialName={user.name ?? ""}
        initialService={user.preferredService}
        email={user.email}
      />
    </main>
  );
}
