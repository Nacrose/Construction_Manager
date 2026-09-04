import { describe, expect, it } from "vitest";
import { createDemoWorksheetDocument } from "./demo-workbook";
import { LocalWorksheetDocumentStore } from "./local-storage-store";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("LocalWorksheetDocumentStore", () => {
  it("round-trips a versioned worksheet document", async () => {
    const store = new LocalWorksheetDocumentStore(new MemoryStorage(), "test:");
    const document = createDemoWorksheetDocument(new Date("2026-09-03T00:00:00.000Z"));

    await store.save(document);

    await expect(store.load(document.documentId)).resolves.toEqual(document);
  });

  it("ignores malformed and incompatible cached data", async () => {
    const storage = new MemoryStorage();
    const store = new LocalWorksheetDocumentStore(storage, "test:");
    storage.setItem("test:broken", "not-json");
    storage.setItem("test:old", JSON.stringify({ version: 0 }));

    await expect(store.load("broken")).resolves.toBeNull();
    await expect(store.load("old")).resolves.toBeNull();
  });

  it("removes only the requested worksheet", async () => {
    const store = new LocalWorksheetDocumentStore(new MemoryStorage(), "test:");
    const document = createDemoWorksheetDocument();
    await store.save(document);

    await store.remove(document.documentId);

    await expect(store.load(document.documentId)).resolves.toBeNull();
  });
});
