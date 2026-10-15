"use client";

import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import type { Branding } from "@/lib/branding-shared";

// No names here: the platform name and tagline always come from the server, so signed-out visitors' page
// scripts don't contain them when sign-in branding is hidden.
const BrandingContext = createContext<Branding>({
  name: "",
  longName: "",
  isCustom: true,
  logoUrl: null,
  hideLoginBranding: true,
  tagline: "",
});

export function BrandingProvider({ value, children }: { value: Branding; children: React.ReactNode }) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}

/** The platform name: the default name's last word gets the accent color, a custom name renders as-is. */
export function BrandName({ className }: { className?: string }) {
  const b = useBranding();
  const words = b.name.split(" ");
  if (!b.isCustom && words.length > 1) {
    return (
      <span className={className}>
        {words.slice(0, -1).join(" ")} <span className="text-blue-400">{words.at(-1)}</span>
      </span>
    );
  }
  return <span className={className}>{b.name}</span>;
}

/** Logo (if uploaded) followed by the name, for the dark sidebar. */
export function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  const b = useBranding();
  if (collapsed) {
    return b.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={b.logoUrl} alt={b.name} className="h-7 w-7 object-contain mx-auto" />
    ) : (
      <span className="text-lg font-bold text-white mx-auto">{b.name.charAt(0).toUpperCase()}</span>
    );
  }
  return (
    <span className="flex items-center gap-2 min-w-0" title={b.name}>
      {b.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.logoUrl} alt="" className="h-7 max-w-[2.5rem] object-contain shrink-0" />
      )}
      <BrandName className="text-lg font-bold text-white tracking-tight truncate" />
    </span>
  );
}

/** Centered logo + name block above the login/password cards. */
export function AuthBrandHeader() {
  const b = useBranding();
  if (b.hideLoginBranding) return null;
  return (
    <div className="text-center mb-8">
      {b.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.logoUrl} alt="" className="h-14 max-w-[12rem] object-contain mx-auto mb-3" />
      )}
      <h1 className={cn("text-3xl font-bold text-white tracking-tight")}>
        <BrandName />
      </h1>
      {b.tagline && <p className="text-gray-400 mt-1 text-sm">{b.tagline}</p>}
    </div>
  );
}
