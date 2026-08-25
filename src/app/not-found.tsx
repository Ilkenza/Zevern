import { Compass } from "lucide-react";
import { StatusScreen } from "@/components/ui/StatusScreen";

/**
 * An address that matches no route at all. This one renders outside the app shell —
 * it is reached by people who are not signed in as often as by people who are, so it
 * cannot assume a sidebar exists to navigate away with.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-base">
      <StatusScreen
        icon={Compass}
        title="There is nothing at this address."
        description="The link is either mistyped or points at something that has since been removed."
      />
    </div>
  );
}
