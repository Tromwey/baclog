import { redirect } from "next/navigation";

/** Merged into Descubrir (M3.5 nav). Kept as a redirect so old links resolve. */
export default function SearchPage() {
  redirect("/descubrir");
}
