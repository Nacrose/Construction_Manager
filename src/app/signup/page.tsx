"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HardHat, ArrowRight, Loader2, AlertCircle, Building2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { setAuthUser } from "@/lib/client-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlowOrb, MagneticButton } from "@/components/ui/motion";

export default function SignupPage() {
  const _router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFirstUser, setIsFirstUser] = useState<boolean | null>(null);

  // Check if this is the first user (after a database reset)
  useEffect(() => {
    fetch("/api/auth/check-first-user")
      .then((r) => r.json())
      .then((data) => {
        setIsFirstUser(data.isFirstUser === true);
      })
      .catch(() => setIsFirstUser(false));
  }, []);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!isFirstUser && !orgName.trim()) {
      setError("Organization name is required.");
      return;
    }
    if (!name.trim() || !email.trim() || !password) {
      setError("All fields are required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName: isFirstUser ? "Platform Admin" : orgName.trim(),
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      // Credential = the httpOnly cookie the server just set (v2.0).
      if (data.user) {
        setAuthUser(data.user);
      }
      if (isFirstUser) {
        toast.success("Super admin account created — welcome!");
      } else {
        toast.success(`Welcome to ${orgName.trim()}! Your organization is ready.`);
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-radial">
      <GlowOrb color="amber" size={500} className="-top-20 -right-20" />
      <GlowOrb color="navy" size={600} className="-bottom-40 -left-40" />

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(oklch(1 0 0 / 1) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 1) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        {/* If not the first user, show "contact admin" message instead of signup form */}
        {isFirstUser === false ? (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md text-center"
          >
            <motion.div
              initial={{ rotate: -20, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
              className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-gradient shadow-lg glow-amber"
            >
              <HardHat className="h-7 w-7" style={{ color: "oklch(0.22 0.07 258)" }} />
            </motion.div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-4 font-sans">
              Contractor
            </h1>
            <Card className="border-0 bg-white/5 backdrop-blur-md">
              <CardContent className="pt-6 pb-6 px-6">
                <AlertCircle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
                <p className="text-sm text-white/80 mb-4">
                  Public sign-up is disabled. New accounts are created by your organization administrator.
                </p>
                <p className="text-xs text-white/50 mb-4">
                  If you need access, contact your organization admin or the platform administrator.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    Back to Login
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
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
            <motion.div
              initial={{ rotate: -20, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
              className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-gradient shadow-lg glow-amber"
            >
              <HardHat className="h-7 w-7" style={{ color: "oklch(0.22 0.07 258)" }} />
            </motion.div>
            <h1 className="text-3xl font-bold tracking-tight text-white font-sans">
              Contractor <span className="text-success/80 font-mono text-sm tracking-widest font-normal">OS</span>
            </h1>
            <p className="mt-2 text-sm text-white/60">
              {isFirstUser === true
                ? "Create your super admin account to manage the platform"
                : "Create your organization and start managing projects"}
            </p>
          </motion.div>

          {/* Glass card */}
          <div className="glass-strong rounded-2xl p-1 glow-soft">
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="space-y-1 px-6 pt-6">
                <CardTitle className="text-xl font-semibold text-foreground flex items-center gap-2">
                  {isFirstUser === true ? (
                    <><ShieldCheck className="h-5 w-5 text-amber-400" /> Super Admin Setup</>
                  ) : (
                    <><Building2 className="h-5 w-5 text-amber-400" /> Sign Up</>
                  )}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {isFirstUser === true
                    ? "First user becomes the platform super admin"
                    : "Register your construction firm and become the admin"}
                </CardDescription>
              </CardHeader>
              <form onSubmit={submit}>
                <CardContent className="space-y-3 px-6">
                  {/* Super admin signup — no org field needed */}
                  <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="orgName" className="text-sm font-medium">Organization Name</Label>
                      <Input
                        id="orgName"
                        type="text"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="e.g. Sharma Construction Pvt. Ltd."
                        required
                        className="h-11 bg-background/60 backdrop-blur-sm border-border/50 transition-all focus:border-amber-500/50 focus:ring-amber-500/20"
                      />
                    </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="name" className="text-sm font-medium">Your Name</Label>
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Aarav Sharma"
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
                    transition={{ delay: 0.45 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 8 characters"
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
                        <motion.span className="flex items-center gap-2" whileHover={{ x: 2 }}>
                          Create Organization <ArrowRight className="h-4 w-4" />
                        </motion.span>
                      )}
                    </Button>
                  </MagneticButton>
                </CardFooter>
              </form>
            </Card>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-6 text-center"
          >
            <p className="text-xs text-white/50">
              Already have an account?{" "}
              <Link href="/login" className="text-amber-400/80 hover:text-amber-300 hover:underline transition-colors">
                Sign in →
              </Link>
            </p>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-6 text-center text-[10px] text-white/30"
          >
            First user becomes the platform super admin
          </motion.p>
        </motion.div>
        )}
      </div>
    </div>
  );
}
