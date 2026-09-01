import { AppLoadingScreen } from "@/components/ui/app-loading-screen";

/**
 * Loading fallback for the (app) route group.
 *
 * Shows instantly while the route's JS chunk loads + the page's
 * data queries resolve. Without this, the browser shows nothing
 * during route transitions.
 */
export default function AppLoading() {
  return <AppLoadingScreen />;
}
