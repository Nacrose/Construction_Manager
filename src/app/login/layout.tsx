// Server Component — forces this route to be dynamic (no static prerender)
export const dynamic = "force-dynamic";

import { Suspense } from "react";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense>{children}</Suspense>;
}
