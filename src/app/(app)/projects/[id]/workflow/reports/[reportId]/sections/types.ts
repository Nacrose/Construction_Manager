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

export function jsonArrayString(arr: any[]): string | undefined {
  if (arr.length === 0) return undefined;
  if (
    arr.every((r) =>
      Object.values(r).every((v) => v === 0 || v === "" || v === false || v === null)
    )
  )
    return undefined;
  return JSON.stringify(arr);
}
