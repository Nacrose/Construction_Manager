import {
  isWorksheetDocument,
  type WorksheetDocument,
  type WorksheetDocumentStore,
} from "./types";

const DEFAULT_PREFIX = "construction-manager:worksheet:";

export class LocalWorksheetDocumentStore implements WorksheetDocumentStore {
  constructor(
    private readonly storage: Storage,
    private readonly prefix = DEFAULT_PREFIX
  ) {}

  async load(documentId: string): Promise<WorksheetDocument | null> {
    const raw = this.storage.getItem(this.key(documentId));
    if (!raw) return null;

    try {
      const parsed: unknown = JSON.parse(raw);
      return isWorksheetDocument(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(document: WorksheetDocument): Promise<void> {
    this.storage.setItem(this.key(document.documentId), JSON.stringify(document));
  }

  async remove(documentId: string): Promise<void> {
    this.storage.removeItem(this.key(documentId));
  }

  private key(documentId: string): string {
    return `${this.prefix}${documentId}`;
  }
}
