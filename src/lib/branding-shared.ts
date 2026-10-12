export const DEFAULT_PLATFORM_NAME = "Sympl PA";
export const DEFAULT_LONG_NAME = "Sympl Pricing Analysis";

export interface Branding {
  /** Short name shown in the UI and page title. */
  name: string;
  /** Longer name used in emails ("the ___ platform"). */
  longName: string;
  isCustom: boolean;
  /** Versioned URL of the uploaded logo, or null. */
  logoUrl: string | null;
  /** Hide the logo/name header above the sign-in, forgot and reset password cards. */
  hideLoginBranding: boolean;
}

export const DEFAULT_BRANDING: Branding = {
  name: DEFAULT_PLATFORM_NAME,
  longName: DEFAULT_LONG_NAME,
  isCustom: false,
  logoUrl: null,
  hideLoginBranding: false,
};

export const LOGO_MAX_BYTES = 512 * 1024;
export const PLATFORM_NAME_MAX = 60;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
