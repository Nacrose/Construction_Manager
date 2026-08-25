"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { setAuth } from "@/lib/client-auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Admin login failed");

      if (data.token && data.user) {
        setAuth(data.token, data.user);
      }
      toast.success("Welcome, administrator.");
      window.location.href = "/admin";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-navy-radial p-4">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex items-center justify-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-gradient shadow-lg glow-amber">
              <ShieldAlert className="h-6 w-6 text-navy-deep" style={{ color: "oklch(0.22 0.07 258)" }} />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Platform <span className="text-gradient-amber">Admin</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Restricted area — administrators only
          </p>
        </div>

        <div className="glass-strong rounded-2xl p-1 glow-soft">
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="space-y-1 px-6 pt-6">
              <CardTitle className="text-xl font-semibold text-foreground">Administrator sign in</CardTitle>
              <CardDescription className="text-muted-foreground">
                Use your platform operator credentials.
              </CardDescription>
            </CardHeader>
            <form onSubmit={submit}>
              <CardContent className="space-y-4 px-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@platform.com"
                    required
                    className="h-11 bg-background/60 backdrop-blur-sm border-border/50 focus:border-amber-500/50 focus:ring-amber-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="h-11 bg-background/60 backdrop-blur-sm border-border/50 focus:border-amber-500/50 focus:ring-amber-500/20"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="px-6 pb-6">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-navy-gradient text-white hover:opacity-90 border-0 font-medium shadow-md"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign in <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          Not an administrator?{" "}
          <Link href="/login" className="text-amber-400 hover:underline">
            Go to standard sign-in
          </Link>
        </p>
      </div>
    </div>
  );
}
