import Link from "next/link";
import { ForgotForm } from "./ForgotForm";

export default function ForgotPasswordPage() {
  return (
    <div className="zv-stagger w-full">
      <div className="mb-6 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.14em] text-gold/85">
          {"// reset"}
        </div>
        <h1 className="mt-2 font-display text-[27px] font-extrabold tracking-[-0.7px] text-ink">
          Forgot password
        </h1>
        <p className="mt-1 text-sm text-muted">We&apos;ll email you a reset link.</p>
      </div>

      <ForgotForm />

      <div className="mt-5 text-center">
        <Link href="/login" className="text-[12px] font-semibold text-muted hover:text-ink">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
