export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON object required");
  }
  return value as Record<string, unknown>;
}
export function uuid(
  value: unknown,
  name: string,
  optional = false,
): string | null {
  if (optional && (value === null || value === undefined)) return null;
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  ) throw new Error(`${name} must be a UUID`);
  return value;
}
