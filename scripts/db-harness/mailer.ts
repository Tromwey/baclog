/**
 * `@/auth/mailer` for the DB harness: records who was mailed and THROWS for
 * any address starting with "fail" (a provider that is down for that user).
 */
export const sentTo: string[] = [];

function deliver(email: string): void {
  if (email.startsWith("fail")) throw new Error(`mailer down for ${email}`);
  sentTo.push(email);
}

export async function sendReleaseEmail(email: string): Promise<void> {
  deliver(email);
}
export async function sendRecapEmail(email: string): Promise<void> {
  deliver(email);
}
export function releaseFirstLine(t: { title: string }): string {
  return `Hoy sale ${t.title}`;
}
export function releaseSubject(title: string): string {
  return `Ya salió ${title}`;
}
