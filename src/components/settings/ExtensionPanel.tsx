"use client";

import { useState, useTransition } from "react";
import { KeyRound, Copy, Check, AlertTriangle } from "lucide-react";
import { generateExtToken } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/Button";

/**
 * Only the hash of the token is stored, so the plaintext exists in this component
 * and nowhere else, from the moment it is generated until the page is left.
 */
export function ExtensionPanel({
  hasToken,
  url,
  anonKey,
}: {
  hasToken: boolean;
  url: string;
  anonKey: string;
}) {
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = () =>
    startTransition(async () => {
      setError(null);
      const res = await generateExtToken();
      if (res?.error) setError(res.error);
      else if (res?.token) setToken(res.token);
    });

  const copyConfig = async () => {
    if (!token) return;
    const config = JSON.stringify({ url, anonKey, token }, null, 2);
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copy failed.");
    }
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <p className="text-[13px] leading-relaxed text-muted">
        Connect the <b className="text-ink">Lead Collector</b> extension to your account:
        generate a token, click “Copy config”, then paste it into the extension (Options).
        Generating a new token revokes the old one instantly.
      </p>

      {token ? (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gold">
              <AlertTriangle className="h-3.5 w-3.5" />
              Copy it now — it is not shown again
            </div>
            <code className="mono block break-all rounded-ctrl border border-gold/40 bg-white/3 px-3 py-2 text-[12px] text-ink">
              {token}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" onClick={copyConfig}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy config for the extension"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {hasToken && (
            <p className="text-[12.5px] text-muted">
              A token is already set up. Only its hash is stored, so it cannot be shown again —
              generate a new one if you no longer have it.
            </p>
          )}
          <Button type="button" variant="primary" onClick={generate} disabled={pending}>
            <KeyRound className="h-4 w-4" />
            {pending ? "Generating…" : hasToken ? "Generate a new token" : "Generate token"}
          </Button>
        </div>
      )}

      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
