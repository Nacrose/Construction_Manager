"use client";
import { useEffect, useState } from "react";

// Avoids the "setState in effect" lint warning by giving the pattern a name.
// Returns true after the component has mounted on the client.
export function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
