"use client";

import Link from "next/link";
import { WifiOff, ArrowLeft, Home } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-radial p-6">
      <div className="max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10 ring-2 ring-amber-500/30">
          <WifiOff className="h-10 w-10 text-amber-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">You are offline</h1>
          <p className="text-sm text-white/70">
            The Construction Manager app needs an internet connection to load pages you
            haven&rsquo;t visited before. Once you&rsquo;ve opened a page at least once while
            online, it will be available offline.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-left text-sm text-white/80">
          <p className="mb-2 font-medium text-white">What you can still do offline:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>View any page you&rsquo;ve opened before</li>
            <li>Create new daily reports, RFIs, and forms</li>
            <li>Queue submissions — they auto-sync when you reconnect</li>
            <li>View cached drawings and documents</li>
          </ul>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400 transition"
          >
            <Home className="h-4 w-4" />
            Try Dashboard
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
