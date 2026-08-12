export function normalizeOutboundText(value: unknown): string {
  return String(value ?? "").replaceAll("\\n", "\n");
}
