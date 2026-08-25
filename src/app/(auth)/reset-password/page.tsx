import { ResetForm } from "./ResetForm";

export default function ResetPasswordPage() {
  return (
    <div className="zv-stagger w-full">
      <div className="mb-6 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.14em] text-gold/85">
          {"// new password"}
        </div>
        <h1 className="mt-2 font-display text-[27px] font-extrabold tracking-[-0.7px] text-ink">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-muted">Choose a new password for your account.</p>
      </div>

      <ResetForm />
    </div>
  );
}
