import { AuthForm } from "./AuthForm";

export default function LoginPage() {
  return (
    <div className="zv-stagger w-full">
      <div className="mb-6 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.14em] text-gold/85">
          {"// access"}
        </div>
        <h1 className="mt-2 font-display text-[27px] font-extrabold tracking-[-0.7px] text-ink">
          Zevern
        </h1>
        <p className="mt-1 text-sm text-muted">Run your whole business from one screen.</p>
      </div>

      <AuthForm />

      <div className="mono mt-5 flex items-center justify-between text-[10.5px] uppercase tracking-[0.12em] text-faint">
        <span>v1.0</span>
        <span>system · online</span>
      </div>
    </div>
  );
}
