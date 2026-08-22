export function parseJsonArray(value: string | any[] | null | undefined): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function jsonArrayString(arr: any[]): string {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return "[]";
  return JSON.stringify(arr);
}
