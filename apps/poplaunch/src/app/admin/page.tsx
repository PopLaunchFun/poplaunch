import { AdminPanel } from "@/components/admin-panel";

export const metadata = { title: "Protocol admin — Pop Launch" };

/** Only useful to the protocol authority; everyone else sees read-only settings. Nothing here moves funds. */
export default function AdminPage() {
  return <AdminPanel />;
}
