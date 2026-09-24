import { withApi } from "@/authz/api";
import { noContent } from "../../_lib/http";

/**
 * POST /api/v1/auth/logout (bearer) → 204. There is no server state to drop
 * (§2.1: no session table); the app forgets the token. Bearer-gated anyway
 * so the endpoint has the same posture as the rest of v1 and a future
 * per-device revocation slots in here.
 */
export const POST = withApi(async () => noContent());
