"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HardHat, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { setAuth } from "@/lib/client-auth";
import { GlowOrb, MagneticButton } from "@/components/ui/motion";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" /></div>}>
      <LoginScene />
    </Suspense>
  );
}

function LoginScene() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-radial">
      {/* Animated glow orbs */}
      <GlowOrb color="amber" size={500} className="-top-20 -right-20" />
      <GlowOrb color="navy" size={600} className="-bottom-40 -left-40" />
      <GlowOrb color="amber" size={300} className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30" />

      {/* Top bar */}
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(oklch(1 0 0 / 1) 1px, transparent 1px),
            linear-gradient(90deg, oklch(1 0 0 / 1) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <LoginCard />
      </div>
    </div>
  );
}

function LoginCard() {
  const _router = useRouter();
  const search = useSearchParams();
  // Sanitize the `next` param to prevent open-redirect attacks.
  // Only allow same-origin absolute paths (must start with "/" and must
  // not start with "//" which browsers treat as protocol-relative).
  // Anything else (full URLs, "//evil.com", backslashes, etc.) falls
  // back to "/dashboard". This matters because an attacker can craft a
  // phishing URL like /login?next=https://evil.com and the victim would
  // be redirected there after a legitimate-looking login.
  const rawNext = search.get("next") || "/dashboard";
  const next =
    typeof rawNext === "string" &&
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.startsWith("/\\")
      ? rawNext
      : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    const payload = creds ?? { email, password };
    if (!payload.email || !payload.password) {
      setError("Please enter email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      if (data.token && data.user) {
        setAuth(data.token, data.user);
      }

      toast.success("Welcome back!");
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-md"
    >
      {/* Brand */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="mb-8 text-center"
      >
        <div className="mb-4 inline-flex items-center justify-center gap-3">
          <motion.div
            initial={{ rotate: -20, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-gradient shadow-lg glow-amber"
          >
            <HardHat className="h-7 w-7 text-navy-deep" style={{ color: "oklch(0.22 0.07 258)" }} />
          </motion.div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white font-sans">
          Contractor <span className="text-emerald-400 font-mono text-sm tracking-widest font-normal">OS</span>
        </h1>
        <p className="mt-1.5 text-xs text-white/60">
          Construction Enterprise &amp; Site Management Platform
        </p>
      </motion.div>

      {/* Glass card */}
      <div className="glass-strong rounded-2xl p-1 glow-soft">
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader className="space-y-1 px-6 pt-6">
            <CardTitle className="text-xl font-semibold text-foreground">Sign in</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your credentials to access your projects
            </CardDescription>
          </CardHeader>
          <form onSubmit={submit}>
            <CardContent className="space-y-4 px-6">
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-2"
              >
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="h-11 bg-background/60 backdrop-blur-sm border-border/50 transition-all focus:border-amber-500/50 focus:ring-amber-500/20"
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-2"
              >
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-11 bg-background/60 backdrop-blur-sm border-border/50 transition-all focus:border-amber-500/50 focus:ring-amber-500/20"
                />
              </motion.div>
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
            <CardFooter className="px-6 pb-6">
              <MagneticButton className="w-full" strength={0.15}>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-navy-gradient text-white hover:opacity-90 transition-opacity border-0 font-medium shadow-md"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <motion.span
                      className="flex items-center gap-2"
                      whileHover={{ x: 2 }}
                    >
                      Sign in <ArrowRight className="h-4 w-4" />
                    </motion.span>
                  )}
                </Button>
              </MagneticButton>
            </CardFooter>
          </form>
        </Card>
      </div>

      {/* Demo accounts */}
      {/* No public signup — accounts created by admins */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-6 text-center text-[10px] text-white/30"
      >
        Need access? Contact your organization administrator.
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="mt-6 text-center text-[10px] text-white/30"
      >
        Server-side auth · JWT · Audit-logged
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="mt-2 text-center text-[11px] text-white/40"
      >
        Platform administrator?{" "}
        <Link href="/admin/login" className="text-amber-400 hover:underline">
          Sign in to the admin console
        </Link>
      </motion.p>
    </motion.div>
  );
}
