/** The two steps of signing in: the address, then the code sent to it. */
export type Step = "email" | "code";

/** How long before a fresh code can be asked for. */
export const RESEND_S = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whether an address will do: the server's own test, before it's asked. */
export function isValidEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  return email.length <= 320 && EMAIL_RE.test(email);
}

/** What went wrong signing in, said plainly. */
export function plainly(e: unknown, step: Step): string {
  const m = e instanceof Error ? e.message : "";
  if (/network request failed|failed to fetch|load failed|timed out/i.test(m))
    return "The guide couldn't reach its editors. Check your connection and try again.";
  if (/too many codes/i.test(m)) return "That's three codes in a quarter of an hour. Wait a few minutes, then ask again.";
  if (/incorrect code/i.test(m)) return "That code doesn't match. Check the latest email and try again.";
  if (/expired or not found/i.test(m)) return "That code has run out. Send yourself a new one.";
  if (/too many attempts/i.test(m)) return "Too many tries with that code. Send yourself a new one.";
  if (/invalid email/i.test(m)) return "That doesn't look like an email address.";
  return step === "email"
    ? "The code couldn't be sent just now. Try again in a moment."
    : "The code couldn't be checked just now. Try again in a moment.";
}
