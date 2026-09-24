import "server-only";
import { loadUserById } from "@/auth/session";
import { ApiError } from "@/authz/api";
import { buildMe } from "../../_lib/me";
import type { Me } from "../../_lib/schemas";

/**
 * `Me` AFTER a write to the account: re-reads the user through the one loader
 * (explicit field list, no `birthYear`) so the payload reflects the write and
 * is byte-for-byte what `GET /me` returns next. A row that vanished or got
 * blocked between the write and the read is a 401 (the bearer is already
 * revoked), never a half-built `Me`.
 */
export async function freshMe(userId: string): Promise<Me> {
  const user = await loadUserById(userId);
  if (!user) throw new ApiError("unauthorized");
  return buildMe(user);
}
