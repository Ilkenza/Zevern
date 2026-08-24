"use client";

import { useActionState } from "react";
import {
  changePassword,
  type SettingsState,
} from "@/app/(app)/settings/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function PasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    changePassword,
    undefined,
  );

  return (
    <form action={formAction} className="px-4 py-4">
      <p className="mb-3 text-[12px] text-muted">
        Signed in as <span className="mono text-ink">{email}</span>.
      </p>

      <Field
        label="Current password"
        name="current"
        type="password"
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />
      <Field
        label="New password"
        name="password"
        type="password"
        placeholder="••••••••"
        autoComplete="new-password"
        minLength={10}
        required
      />
      <Field
        label="Confirm password"
        name="confirm"
        type="password"
        placeholder="••••••••"
        autoComplete="new-password"
        minLength={10}
        required
      />

      {state?.error && (
        <p className="mb-3 rounded-ctrl border border-danger/40 bg-danger-bg px-3 py-2 text-[12px] text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="mb-3 rounded-ctrl border border-ok/40 bg-ok-bg px-3 py-2 text-[12px] text-ok">
          Password updated.
        </p>
      )}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
