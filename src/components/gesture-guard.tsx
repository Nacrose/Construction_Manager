"use client";

import { useEffect } from "react";

/**
 * GestureGuard
 * Prevents accidental browser "Back / Forward" navigation triggered by
 * 2-finger horizontal trackpad swipe gestures on macOS (Safari, Chrome, Firefox).
 */
export function GestureGuard() {
  useEffect(() => {
    // 1. Enforce overscroll-behavior none on document elements
    document.documentElement.style.overscrollBehaviorX = "none";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overscrollBehaviorX = "none";
    document.body.style.overscrollBehavior = "none";

    // 2. Native non-passive wheel interceptor at scroll boundaries
    const handleWheel = (e: WheelEvent) => {
      // If no horizontal intent, allow normal vertical scrolling
      if (Math.abs(e.deltaX) === 0) return;

      // Find the horizontally scrollable container under cursor
      let target = e.target as HTMLElement | null;
      let hasHorizontalScrollSpace = false;

      while (target && target !== document.body && target !== document.documentElement) {
        const style = window.getComputedStyle(target);
        const overflowX = style.overflowX;

        if (
          (overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay") &&
          target.scrollWidth > target.clientWidth
        ) {
          const atLeftEdge = target.scrollLeft <= 0 && e.deltaX < 0;
          const atRightEdge =
            target.scrollLeft + target.clientWidth >= target.scrollWidth - 1 && e.deltaX > 0;

          if (!atLeftEdge && !atRightEdge) {
            // Container can still consume this horizontal delta
            hasHorizontalScrollSpace = true;
            break;
          }
        }
        target = target.parentElement;
      }

      // If at boundary or over a non-scrollable surface, prevent browser history swipe
      if (!hasHorizontalScrollSpace) {
        e.preventDefault();
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return null;
}
