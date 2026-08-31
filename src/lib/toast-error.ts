/**
 * Centralised toast-error utility.
 *
 * Shows a user-friendly error message with an optional "Copy" action so
 * users can paste technical details into a bug report without seeing raw
 * stack traces in the UI.
 *
 * Usage:
 *   // context-aware label + raw tRPC error for copy
 *   onError: (e) => toastError("Guarantee could not be saved.", e.message)
 *
 *   // or when the tRPC message is already user-safe
 *   onError: (e) => toastError(e.message)
 */
import { toast } from "sonner";

/**
 * Show a styled error toast.
 * @param userMessage  What the user sees (friendly, no Prisma/stack-trace jargon).
 * @param technicalDetail  Optional raw error string copied to clipboard on "Copy".
 *                         Defaults to `userMessage` so there is always something
 *                         useful on the clipboard.
 * @param durationMs  Toast display time. Defaults to 8 s for errors.
 */
export function toastError(
  userMessage: string,
  technicalDetail?: string,
  durationMs = 8000,
): void {
  const copyText = technicalDetail ?? userMessage;

  toast.error(userMessage, {
    duration: durationMs,
    action: {
      label: "Copy",
      onClick: () => {
        navigator.clipboard.writeText(copyText).catch(() => {
          /* clipboard may be unavailable in some browser contexts */
        });
        toast.success("Error details copied to clipboard.", { duration: 2500 });
      },
    },
  });
}
