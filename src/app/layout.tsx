import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { BrandingProvider } from "@/components/branding/branding";
import { getPageBranding } from "@/lib/branding";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export async function generateMetadata(): Promise<Metadata> {
  const { branding, anonymous } = await getPageBranding();
  if (anonymous) {
    // Sign-in branding is hidden: nothing in the tab, metadata or favicon identifies the platform.
    return {
      title: "Sign in",
      icons: { icon: "data:," },
      robots: { index: false, follow: false, nocache: true },
    };
  }
  return {
    title: branding.name,
    description: "Multi-channel pricing analysis and profitability platform",
    icons: { icon: branding.logoUrl ?? "/favicon.svg" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { branding } = await getPageBranding();
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full font-sans">
        <BrandingProvider value={branding}>
          <Providers>{children}</Providers>
        </BrandingProvider>
      </body>
    </html>
  );
}
