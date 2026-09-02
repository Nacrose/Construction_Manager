import { describe, it, expect } from "vitest";
import { assertSameOrigin, originMatches } from "./csrf";

/**
 * Helper: build a Request the way a browser/proxy would deliver it.
 *
 * NOTE: Node's undici does NOT expose a synthesized Host header on Request
 * objects (it is attached when the request is dispatched). Real HTTP traffic
 * always carries Host (and HTTP/2 :authority is mapped to host by Next), so
 * the harness sets it explicitly unless a test deliberately overrides it.
 */
function req(
  method: string,
  headers: Record<string, string> = {},
  url = "https://app.example.com/api/trpc",
): Request {
  const h = { ...headers };
  if (!h.host && !h["x-forwarded-host"]) {
    h.host = new URL(url).host;
  }
  return new Request(url, { method, headers: h });
}

const SAME_ORIGIN = "https://app.example.com";

describe("assertSameOrigin — safe methods", () => {
  it("allows GET even with a hostile cross-site Origin header", () => {
    expect(
      assertSameOrigin(req("GET", { origin: "https://evil.example" })),
    ).toBeNull();
  });

  it("allows HEAD and OPTIONS unconditionally", () => {
    expect(assertSameOrigin(req("HEAD"))).toBeNull();
    expect(assertSameOrigin(req("OPTIONS"))).toBeNull();
  });
});

describe("assertSameOrigin — POST with Origin", () => {
  it("allows a same-origin POST", () => {
    expect(assertSameOrigin(req("POST", { origin: SAME_ORIGIN }))).toBeNull();
  });

  it("allows a same-origin POST when a proxy forwards the public host", () => {
    // Proxy chain: browser → TLS proxy (public host) → internal Next server.
    expect(
      assertSameOrigin(
        req("POST", {
          origin: SAME_ORIGIN,
          "x-forwarded-host": "app.example.com",
          "x-forwarded-proto": "https",
          host: "internal-upstream:3000",
        }),
      ),
    ).toBeNull();
  });

  it("rejects a cross-origin POST with 403", () => {
    const res = assertSameOrigin(
      req("POST", { origin: "https://evil.example" }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("rejects a same-host but wrong-scheme origin when the proxy scheme is known", () => {
    // http:// page attempting an https:// deployment — downgrade attack signal.
    const res = assertSameOrigin(
      req("POST", {
        origin: "http://app.example.com",
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https",
        host: "app.example.com",
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("rejects the literal null origin (sandboxed iframe)", () => {
    const res = assertSameOrigin(req("POST", { origin: "null" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("rejects a malformed Origin header", () => {
    const res = assertSameOrigin(req("POST", { origin: "not a url" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("rejects non-http(s) schemes (data:, blob:)", () => {
    const res = assertSameOrigin(
      req("POST", { origin: "data:text/html,hi" }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("rejects an Origin whose host is NOT among the request's host headers", () => {
    // Node's Request synthesizes Host from the URL, so a mismatched Origin
    // against a deliberately different Host header is the testable shape.
    const res = assertSameOrigin(
      req("POST", {
        origin: "https://app.example.com",
        host: "other-upstream.example.com",
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("accepts when only Origin is absent and Referer is absent (non-browser client)", () => {
    // curl / cron / service-to-service: no Origin, no Referer.
    expect(assertSameOrigin(req("POST"))).toBeNull();
  });
});

describe("assertSameOrigin — POST with Referer fallback", () => {
  it("allows a POST whose Referer is same-origin", () => {
    expect(
      assertSameOrigin(
        req("POST", { referer: "https://app.example.com/projects/123" }),
      ),
    ).toBeNull();
  });

  it("rejects a POST whose Referer is cross-origin", () => {
    const res = assertSameOrigin(
      req("POST", { referer: "https://evil.example/bait" }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("rejects a malformed Referer", () => {
    const res = assertSameOrigin(req("POST", { referer: "::garbage::" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });
});

describe("originMatches — host normalization", () => {
  it("matches explicit ports on both sides", () => {
    const r = req("POST", { host: "localhost:3000" }, "http://localhost:3000/api");
    expect(originMatches(r, "http://localhost:3000")).toBe(true);
  });

  it("does not match a same-scheme different-port host", () => {
    const r = req("POST", { host: "app.example.com" });
    expect(originMatches(r, "https://app.example.com:8443")).toBe(false);
  });

  it("takes the first entry of a comma-separated X-Forwarded-Host chain", () => {
    const r = req("POST", {
      "x-forwarded-host": "public.example.com, inner.example.com",
      host: "inner.example.com",
    });
    expect(originMatches(r, "https://public.example.com")).toBe(true);
    expect(originMatches(r, "https://evil.example.com")).toBe(false);
  });
});
