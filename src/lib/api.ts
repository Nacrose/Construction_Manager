import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorToResponse } from "@/lib/authz";

// Standard JSON helpers for Route Handlers.

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function serverError(message = "Internal server error") {
  return NextResponse.json({ error: message }, { status: 500 });
}

// Converts thrown auth/zod errors into the right HTTP response.
export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: err.issues },
      { status: 400 }
    );
  }
  if (err instanceof Error) {
    const auth = authErrorToResponse(err);
    if (auth.status !== 500) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    // Show actual error for debugging (temporarily — revert in production)
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
  return serverError();
}
