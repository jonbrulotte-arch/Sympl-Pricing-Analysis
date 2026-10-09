"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOGO_MAX_BYTES, PLATFORM_NAME_MAX } from "@/lib/branding-shared";

export function BrandingSettings() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [defaultName, setDefaultName] = useState("Sympl PA");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [hideLoginBranding, setHideLoginBranding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/settings/branding")
      .then((r) => r.json())
      .then((d) => {
        setName(d.platformName ?? "");
        setDefaultName(d.defaultName ?? "Sympl PA");
        setLogoUrl(d.logoUrl ?? null);
        setHideLoginBranding(!!d.hideLoginBranding);
      });
  }, []);

  useEffect(() => {
    if (!pendingLogo) {
      setPendingPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingLogo);
    setPendingPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingLogo]);

  function pickFile(f: File | undefined) {
    setMessage(null);
    if (!f) return;
    if (f.size > LOGO_MAX_BYTES) {
      setMessage({ ok: false, text: `Logo must be ${Math.round(LOGO_MAX_BYTES / 1024)} KB or smaller.` });
      return;
    }
    setPendingLogo(f);
    setRemoveLogo(false);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const form = new FormData();
    form.set("platformName", name);
    form.set("hideLoginBranding", String(hideLoginBranding));
    if (pendingLogo) form.set("logo", pendingLogo);
    else if (removeLogo) form.set("removeLogo", "true");
    const res = await fetch("/api/admin/settings/branding", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "Failed to save branding" });
      return;
    }
    setName(data.platformName ?? "");
    setLogoUrl(data.logoUrl ?? null);
    setHideLoginBranding(!!data.hideLoginBranding);
    setPendingLogo(null);
    setRemoveLogo(false);
    if (fileRef.current) fileRef.current.value = "";
    setMessage({ ok: true, text: "Branding saved." });
    router.refresh();
  }

  const shownLogo = pendingPreview ?? (removeLogo ? null : logoUrl);
  const displayName = name.trim() || defaultName;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-700 w-40 shrink-0">Platform name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={defaultName}
          maxLength={PLATFORM_NAME_MAX}
          className="flex-1"
        />
      </div>
      <p className="text-xs text-gray-500 -mt-2 ml-[10.75rem]">
        Leave blank to use the default ({defaultName}). Shown in the sidebar, sign-in pages, browser tab and emails.
      </p>

      <div className="flex items-start gap-3">
        <label className="text-sm text-gray-700 w-40 shrink-0 pt-2">Logo (optional)</label>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {shownLogo ? "Replace logo" : "Upload logo"}
            </Button>
            {shownLogo && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => {
                  setPendingLogo(null);
                  setRemoveLogo(true);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Remove
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>
          <p className="text-xs text-gray-500">
            PNG, JPEG, WebP, GIF or SVG, up to {Math.round(LOGO_MAX_BYTES / 1024)} KB. A square or wide logo on a
            transparent background works best on the dark sidebar.
          </p>
        </div>
      </div>

      <div className="ml-[10.75rem]">
        <p className="text-xs text-gray-500 mb-1">Preview</p>
        <div className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 h-14">
          {shownLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownLogo} alt="" className="h-7 max-w-[2.5rem] object-contain" />
          )}
          {name.trim() ? (
            <span className="text-lg font-bold text-white tracking-tight">{displayName}</span>
          ) : (
            <span className="text-lg font-bold text-white tracking-tight">
              Sympl <span className="text-blue-400">PA</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <span className="text-sm text-gray-700 w-40 shrink-0">Sign-in pages</span>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hideLoginBranding}
            onChange={(e) => setHideLoginBranding(e.target.checked)}
            className="h-4 w-4 mt-0.5 rounded border-gray-300 text-blue-600"
          />
          <span>
            <span className="text-sm text-gray-900">Hide logo and name on the sign-in pages</span>
            <span className="block text-xs text-gray-500">
              Removes the logo, platform name and &ldquo;Pricing Analysis Platform&rdquo; above the login, forgot
              password and reset password forms. The sidebar, browser tab and emails are unaffected.
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Branding"}
        </Button>
        {message && (
          <span className={message.ok ? "text-sm text-green-700" : "text-sm text-red-600"}>
            {message.ok ? <Check className="h-4 w-4 inline mr-1" /> : <AlertCircle className="h-4 w-4 inline mr-1" />}
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
