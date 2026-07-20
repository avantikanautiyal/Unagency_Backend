/** Log helpers — scrubbing reminder for callers. */
export function sanitizeLogMessage(message: string): string {
  return message.replace(/(sk-[a-zA-Z0-9]+|Bearer\s+\S+)/g, "[REDACTED]");
}
