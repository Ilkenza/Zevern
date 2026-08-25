import { SearchX } from "lucide-react";
import { StatusScreen } from "@/components/ui/StatusScreen";

/**
 * `notFound()` from a page that looked up a row by id — an invoice, a lead, a quote —
 * and found nothing that belongs to this account. The wording says both things at
 * once on purpose: a row that was deleted and a row that is somebody else's are
 * indistinguishable from here, and they should stay that way.
 */
export default function AppNotFound() {
  return (
    <StatusScreen
      icon={SearchX}
      title="That is not on your account."
      description="It was either deleted, or the link points somewhere that was never yours to open."
    />
  );
}
