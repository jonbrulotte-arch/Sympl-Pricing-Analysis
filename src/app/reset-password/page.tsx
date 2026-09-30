"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Invalid Link</h2>
        <p className="text-sm text-gray-600">
          This password reset link is missing or malformed. Please request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Request new reset link
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    setLoading(false);
    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to reset password");
    }
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Password Reset</h2>
        <p className="text-sm text-gray-600">
          Your password has been updated successfully. You can now sign in with your new password.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium mt-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Set a new password</h2>
      <p className="text-sm text-gray-500 mb-6">
        Enter your new password below. Must be at least 8 characters.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading || password.length < 8 || !confirmPassword}>
          {loading ? "Resetting..." : "Reset Password"}
        </Button>
      </form>

      <div className="mt-4 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Sympl <span className="text-blue-400">PA</span>
          </h1>
          <p className="text-gray-400 mt-1 text-sm">Pricing Analysis Platform</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <Suspense fallback={<p className="text-sm text-gray-500">Loading...</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
