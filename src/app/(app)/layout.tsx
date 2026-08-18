import { AppGuard } from "@/components/app-guard";

// The layout is a Server Component, but the auth check is client-side
// (via AppGuard) to work reliably through the TLS-terminating gateway.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppGuard>{children}</AppGuard>;
}
