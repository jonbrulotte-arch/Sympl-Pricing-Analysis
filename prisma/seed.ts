import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";
import { DEFAULT_CHANNELS } from "../src/lib/pricing/constants";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPassword = await hash("admin123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@sympl.com" },
    update: {},
    create: {
      id: randomUUID(),
      email: "admin@sympl.com",
      name: "Admin",
      passwordHash: adminPassword,
      role: "ADMIN",
    },
  });

  const customer = await prisma.customer.upsert({
    where: { slug: "demo-company" },
    update: {},
    create: {
      id: randomUUID(),
      name: "Demo Company",
      slug: "demo-company",
    },
  });

  await prisma.customerUser.upsert({
    where: {
      customerId_userId: { userId: admin.id, customerId: customer.id },
    },
    update: {},
    create: {
      userId: admin.id,
      customerId: customer.id,
      role: "OWNER",
    },
  });

  for (let i = 0; i < DEFAULT_CHANNELS.length; i++) {
    const ch = DEFAULT_CHANNELS[i];
    const slug = ch.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+$/, "");

    await prisma.salesChannel.upsert({
      where: { customerId_slug: { customerId: customer.id, slug } },
      update: {},
      create: {
        id: randomUUID(),
        customerId: customer.id,
        name: ch.name,
        slug,
        tabLabel: ch.tabLabel,
        sortOrder: i,
        isDefault: true,
        shippingMode: ch.shippingMode,
        priceField: ch.priceField,
        fallbackPriceField: ch.fallbackPriceField ?? null,
        hasCoupon: ch.flags.coupon,
        hasTax: ch.flags.tax,
        hasCommission: ch.flags.comm,
        hasTopSellerDisc: ch.flags.tsd,
        hasPromotedListing: ch.flags.promo,
        hasFvfFixed: ch.flags.fvf,
        hasCardProcessing: ch.flags.cc,
        hasPpc: ch.flags.ppc,
        hasAdvertising: ch.flags.ad,
        hasPerSkuCommission: ch.flags.commSku,
        hasFallback: ch.flags.fb,
        hasAsin: ch.flags.asin,
        defaults: JSON.parse(JSON.stringify(ch.defaults)),
        blockedBrands: [],
      },
    });
  }

  console.log("Seed complete: admin user + demo customer with 6 channels");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
    pool.end();
  });
