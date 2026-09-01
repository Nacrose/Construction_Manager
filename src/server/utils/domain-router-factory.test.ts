import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createDomainRouter } from "./domain-router-factory";

describe("Canonical Domain Router Factory", () => {
  it("creates a valid tRPC router with standard procedures", () => {
    const testRouter = createDomainRouter({
      model: "punchItem",
      schemas: {
        create: z.object({
          projectId: z.string(),
          number: z.string(),
          title: z.string(),
        }),
      },
    });

    expect(testRouter).toBeDefined();
    expect(testRouter._def.procedures.list).toBeDefined();
    expect(testRouter._def.procedures.get).toBeDefined();
    expect(testRouter._def.procedures.create).toBeDefined();
    expect(testRouter._def.procedures.transition).toBeDefined();
    expect(testRouter._def.procedures.delete).toBeDefined();
  });
});
