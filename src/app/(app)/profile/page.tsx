import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SalsifyApiKeyCard } from "@/components/profile/salsify-api-key-card";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Your account details and personal integration settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Name</span>
            <span className="text-sm font-medium text-gray-900">{session.user.name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Email</span>
            <span className="text-sm font-medium text-gray-900">{session.user.email}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Role</span>
            <Badge variant={session.user.role === "ADMIN" ? "default" : "secondary"} className="text-xs">
              {session.user.role}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <SalsifyApiKeyCard />
    </div>
  );
}
