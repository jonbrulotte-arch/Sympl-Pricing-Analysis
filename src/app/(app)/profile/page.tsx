import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SalsifyApiKeyCard } from "@/components/profile/salsify-api-key-card";
import { ProfileSettings } from "@/components/profile/profile-settings";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your account details, password, and integrations</p>
        </div>
        <Badge variant={session.user.role === "ADMIN" ? "default" : "secondary"} className="text-xs">
          {session.user.role}
        </Badge>
      </div>

      <ProfileSettings user={{ name: session.user.name, email: session.user.email, role: session.user.role }} />

      <SalsifyApiKeyCard />
    </div>
  );
}
