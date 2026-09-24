import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { triggerChannelExport, pollExportStatus, downloadExportFile } from "@/lib/salsify/client";
import { parseWorkbook } from "@/lib/import/parse";
import { autoMapColumns } from "@/lib/import/auto-map";
import { buildRows } from "@/lib/import/build-rows";
import { upsertSalsifyProducts } from "@/lib/db/upsert-salsify-products";
import { randomUUID } from "crypto";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 120;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = await resolveSalsifyCredentials(session.user.id);
  if (!creds.ok) {
    return NextResponse.json({ error: creds.error }, { status: creds.status });
  }

  const appSettings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (!appSettings?.salsifyChannelId) {
    return NextResponse.json(
      { error: "No Salsify Channel ID is configured. Ask an admin to set it in Admin Settings." },
      { status: 400 },
    );
  }

  const importId = randomUUID();
  await prisma.import.create({
    data: {
      id: importId,
      customerId: null,
      uploadedById: session.user.id,
      fileName: "salsify-channel-export",
      source: "salsify",
      status: "processing",
    },
  });

  runSalsifySync(
    importId,
    creds.credentials.apiKey,
    appSettings.salsifyChannelId,
  ).catch((err) => {
    console.error("[salsify-sync] background task failed:", err);
  });

  return NextResponse.json({ importId, status: "processing" }, { status: 202 });
}

async function runSalsifySync(
  importId: string,
  apiKey: string,
  channelId: string,
) {
  try {
    await triggerChannelExport(apiKey, channelId);

    let downloadUrl: string | undefined;
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const result = await pollExportStatus(apiKey, channelId);

      if (result.status === "completed" && result.url) {
        downloadUrl = result.url;
        break;
      }
      if (result.status === "failed") {
        throw new Error("Salsify export run failed");
      }
    }

    if (!downloadUrl) {
      throw new Error("Salsify export timed out waiting for completion");
    }

    const fileBuffer = await downloadExportFile(downloadUrl);
    const sheets = parseWorkbook(fileBuffer);
    if (sheets.length === 0) throw new Error("Export file contains no data");

    const sheet = sheets[0];
    const columnMap = autoMapColumns(sheet.headers);
    if (columnMap.sku === undefined) {
      throw new Error("Export file has no recognizable SKU column");
    }

    const rows = buildRows(sheet.data, columnMap);
    if (rows.length === 0) throw new Error("No valid product rows found in export");

    const { created, updated } = await upsertSalsifyProducts(importId, rows);

    await prisma.import.update({
      where: { id: importId },
      data: {
        status: "complete",
        rowCount: rows.length,
        columnMap: columnMap as Record<string, number>,
        sheetName: sheet.name,
        errors: { created, updated },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[salsify-sync] import ${importId} failed:`, message);
    await prisma.import.update({
      where: { id: importId },
      data: {
        status: "failed",
        errors: { message },
      },
    }).catch(() => {});
  }
}
