"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { authenticate, type AuthState } from "../actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    authenticate,
    undefined,
  );

  return (
    <div className="rounded-card border border-line bg-surface/80 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {/* segmented Sign in / Sign up tabs */}
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-ctrl border border-line bg-white/2 p-1">
        {(["signin", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "min-h-11 rounded-md px-3 py-2 text-[13px] font-semibold transition-colors",
              mode === m ? "bg-gold text-on-gold" : "text-muted hover:text-ink",
            )}
          >
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      <form action={formAction}>
        <input type="hidden" name="mode" value={mode} />

        {mode === "signup" && (
          <Field
            key="fullName"
            label="Full name"
            name="fullName"
            type="text"
            placeholder="Your name"
            autoComplete="name"
          />
        )}
        {/* Stable keys keep these inputs mounted when the full-name field
            appears/disappears, so a typed email/password isn't cleared on tab switch. */}
        <Field
          key="email"
          label="Email"
          name="email"
          type="email"
          placeholder="you@studio.com"
          autoComplete="email"
          required
        />
        <Field
          key="password"
          label="Password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          minLength={6}
          required
        />

        {mode === "signin" && (
          <div className="mb-3 -mt-1 text-right">
            <Link
              href="/forgot-password"
              className="inline-flex min-h-6 items-center text-[11.5px] font-semibold text-muted hover:text-gold-hi"
            >
              Forgot password?
            </Link>
          </div>
        )}

        {state?.error && (
          <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
            {state.error}
          </p>
        )}
        {state?.message && (
          <p className="mb-3 rounded-ctrl border border-ok/40 bg-ok-bg px-3 py-2 text-[12px] text-ok">
            {state.message}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          className="min-h-11 w-full"
          disabled={pending}
        >
          {pending
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-[11px] text-faint">
        <span className="h-px flex-1 bg-line" />
        OR
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="min-h-11 w-full"
        disabled
        title="Google sign-in coming soon"
      >
        Continue with Google
        <span className="mono ml-1 text-[10px] text-faint">soon</span>
      </Button>
    </div>
  );
}
