import { describe, it, expect } from "vitest";
import {
  ok,
  created,
  badRequest,
  notFound,
  unauthorized,
  forbidden,
  conflict,
  serverError,
  handleError,
} from "./api";

/**
 * JSON response helpers in src/lib/api.ts
 *
 * These wrap NextResponse.json() with consistent shapes:
 *   success: { data: T }
 *   error:   { error: string }
 *
 * Getting the status codes right is critical — wrong codes break client
 * error handling (e.g. 401 should trigger re-login, 403 should not).
 */

describe("success responses", () => {
  it("ok() returns 200 with data wrapper", () => {
    const res = ok({ id: 1, name: "test" });
    expect(res.status).toBe(200);
  });

  it("ok() accepts custom status (e.g. 200 for already-exists)", () => {
    const res = ok({ skipped: true }, 200);
    expect(res.status).toBe(200);
  });

  it("created() returns 201", () => {
    const res = created({ id: "new-id" });
    expect(res.status).toBe(201);
  });
});

describe("client error responses (4xx)", () => {
  it("badRequest() returns 400", () => {
    const res = badRequest("Invalid input");
    expect(res.status).toBe(400);
  });

  it("unauthorized() returns 401 (default message)", () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
  });

  it("unauthorized() accepts custom message", () => {
    const res = unauthorized("Token expired");
    expect(res.status).toBe(401);
  });

  it("forbidden() returns 403", () => {
    const res = forbidden("Not a project member");
    expect(res.status).toBe(403);
  });

  it("notFound() returns 404 (default message)", () => {
    const res = notFound();
    expect(res.status).toBe(404);
  });

  it("notFound() accepts custom message", () => {
    const res = notFound("RFI not found");
    expect(res.status).toBe(404);
  });

  it("conflict() returns 409", () => {
    const res = conflict("Email already registered");
    expect(res.status).toBe(409);
  });
});

describe("server error responses (5xx)", () => {
  it("serverError() returns 500 (default message)", () => {
    const res = serverError();
    expect(res.status).toBe(500);
  });

  it("serverError() accepts custom message", () => {
    const res = serverError("Database connection failed");
    expect(res.status).toBe(500);
  });
});

describe("handleError()", () => {
  it("returns 500 for unknown Error", () => {
    const res = handleError(new Error("boom"));
    expect(res.status).toBe(500);
  });

  it("returns 500 for non-Error thrown value (string)", () => {
    const res = handleError("something weird");
    expect(res.status).toBe(500);
  });

  it("returns 500 for null/undefined", () => {
    expect(handleError(null).status).toBe(500);
    expect(handleError(undefined).status).toBe(500);
  });
});
