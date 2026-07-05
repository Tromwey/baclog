import "server-only";
import { env } from "@/lib/env";

/**
 * Email transport seam (launch dep: founder provides RESEND_API_KEY).
 * Console transport keeps the full OTP flow buildable/testable today;
 * Resend swaps in behind the same function with zero call-site changes.
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Baclog <auth@baclog.app>",
        to: [email],
        subject: `${code} es tu código de Baclog`,
        text: `Tu código de acceso es ${code}. Expira en 10 minutos.`,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
    }
    return;
  }
  console.log(`[dev-mailer] OTP para ${email}: ${code}`);
}
