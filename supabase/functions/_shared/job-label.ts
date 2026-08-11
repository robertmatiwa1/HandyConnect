export function serviceRequestLabel(context: Record<string, unknown>): string {
  const serviceName = typeof context.service_name === "string"
    ? context.service_name.trim()
    : "";

  return serviceName || "home service";
}
