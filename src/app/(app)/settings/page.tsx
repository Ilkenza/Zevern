import { createClient } from "@/lib/supabase/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { getProfile } from "@/lib/data/profile";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { BusinessForm } from "@/components/settings/BusinessForm";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { ExtensionPanel } from "@/components/settings/ExtensionPanel";
import { ModulesPanel } from "@/components/settings/ModulesPanel";
import { DangerZone } from "@/components/settings/DangerZone";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = await getProfile();

  return (
    <div className="zv-stagger mx-auto max-w-180 space-y-6">
      <PageHeader
        kicker="Your account"
        title="Settings"
        lede="Who you are on an invoice, which modules you use, and the keys that let the extension in."
      />

      <Panel title="Profile">
        <ProfileForm profile={profile} />
      </Panel>

      <Panel title="Business details">
        <BusinessForm profile={profile} />
      </Panel>

      <Panel title="Modules">
        <ModulesPanel hidden={profile?.hidden_modules ?? []} />
      </Panel>

      <Panel title="Browser extension (Lead Collector)">
        <ExtensionPanel
          hasToken={Boolean(profile?.ext_token_hash)}
          url={supabaseUrl()}
          anonKey={supabaseAnonKey()}
        />
      </Panel>

      <Panel title="Password">
        <PasswordForm email={user?.email ?? ""} />
      </Panel>

      <Panel title="Danger zone">
        <DangerZone email={user?.email ?? ""} />
      </Panel>
    </div>
  );
}
