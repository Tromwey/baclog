import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/backlogs" : "/login");
}
