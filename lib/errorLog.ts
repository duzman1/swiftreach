// Persistent error log for /admin/system. Call from catch blocks of routes
// where we need post-hoc visibility (send loop, webhooks, settings PUT).
//
// SECURITY: never pass raw credentials, decrypted tokens, full request
// bodies, or PII. The route name + the error's message + (optional) stack
// is enough — anything sensitive should be redacted at the call site.
//
// Best-effort: if the insert itself fails (DB blip), we swallow the
// secondary error so we don't replace the original failure path with a
// brand-new exception.

import { prisma } from "./prisma";

export type ErrorSeverity = "error" | "warning";

export async function logError(
  route: string,
  error: unknown,
  opts?: { userId?: string | null; severity?: ErrorSeverity }
): Promise<void> {
  const severity: ErrorSeverity = opts?.severity ?? "error";
  const userId = opts?.userId ?? null;

  let message: string;
  let stack: string | null = null;
  if (error instanceof Error) {
    message = error.message || "Error";
    stack = error.stack ?? null;
  } else {
    message = String(error);
  }

  // Hard-cap message + stack length so a runaway log can't blow up the row.
  const trimmedMessage = message.slice(0, 2000);
  const trimmedStack = stack ? stack.slice(0, 8000) : null;

  try {
    await prisma.errorLog.create({
      data: {
        route,
        message: trimmedMessage,
        stack: trimmedStack,
        userId,
        severity,
      },
    });
  } catch (err) {
    // Don't propagate logging failures.
    // eslint-disable-next-line no-console
    console.error("logError failed:", err);
  }
}
