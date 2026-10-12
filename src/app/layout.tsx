import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { BrandingProvider } from "@/components/branding/branding";
import { getBranding } from "@/lib/branding";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: branding.name,
    description: "Multi-channel pricing analysis and profitability platform",
    icons: { icon: branding.logoUrl ?? "/favicon.svg" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();
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
