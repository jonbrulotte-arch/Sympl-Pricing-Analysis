import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export interface SalsifyCredentials {
  apiKey: string;
  organizationId: string;
  channelId?: string;
}

type SalsifyCredentialsResult =
  | { ok: true; credentials: SalsifyCredentials }
  | { ok: false; error: string; status: number };

export async function resolveSalsifyCredentials(userId: string): Promise<SalsifyCredentialsResult> {
  const [appSettings, user] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: "singleton" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { salsifyApiKeyEncrypted: true } }),
  ]);

  if (!appSettings?.salsifySyncEnabled) {
    return { ok: false, error: "Salsify sync is not enabled. Ask an admin to enable it in Admin Settings.", status: 400 };
  }
  if (!appSettings.salsifyOrgId) {
    return { ok: false, error: "No Salsify Org ID is configured. Ask an admin to set it in Admin Settings.", status: 400 };
  }
  if (!user?.salsifyApiKeyEncrypted) {
    return { ok: false, error: "Add your Salsify API Key in My Profile before running a sync.", status: 400 };
  }

  return {
    ok: true,
    credentials: {
      apiKey: decrypt(user.salsifyApiKeyEncrypted),
      organizationId: appSettings.salsifyOrgId,
      channelId: appSettings.salsifyChannelId ?? undefined,
    },
  };
}
