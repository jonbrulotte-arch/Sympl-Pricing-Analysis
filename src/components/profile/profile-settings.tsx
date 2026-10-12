"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProfileSettingsProps {
  user: { name: string; email: string; role: string };
}

export function ProfileSettings({ user }: ProfileSettingsProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const profileChanged = name.trim() !== user.name || email.trim().toLowerCase() !== user.email;

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
    });
    setSavingProfile(false);
    if (res.ok) {
      setProfileMsg({ type: "success", text: "Profile updated. Changes will appear on your next sign-in." });
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setProfileMsg({ type: "error", text: data.error || "Failed to update profile" });
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "New passwords do not match" });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSavingPassword(false);
    if (res.ok) {
      setPasswordMsg({ type: "success", text: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const data = await res.json().catch(() => ({}));
      setPasswordMsg({ type: "error", text: data.error || "Failed to change password" });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-gray-500" />
            Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email
              </span>
            </label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {profileMsg && (
            <div className={`rounded-lg px-4 py-3 text-sm ${profileMsg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {profileMsg.text}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={savingProfile || !profileChanged || !name.trim() || !email.trim()}>
              {savingProfile ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-gray-500" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </div>
          {passwordMsg && (
            <div className={`rounded-lg px-4 py-3 text-sm ${passwordMsg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {passwordMsg.text}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              onClick={handleChangePassword}
              disabled={savingPassword || !currentPassword || newPassword.length < 8 || !confirmPassword}
            >
              {savingPassword ? "Changing..." : "Change Password"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
