import "dotenv/config";
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

  // Create sample products with cost, price, and shipping data
  const sampleProducts = [
    { sku: "DEMO-001", name: "Widget A", brand: "Acme", cost: 12.50, shipping: 4.99, mcfShip: 6.50, mcfFreight: 2.00, fbaFee: 5.25, prices: { priceJSP: 29.99, priceMCF: 31.99, priceWM: 28.99, priceShopify: 32.99, priceFBM: 30.99, priceFBA: 34.99 } },
    { sku: "DEMO-002", name: "Widget B", brand: "Acme", cost: 8.75, shipping: 3.49, mcfShip: 5.00, mcfFreight: 1.50, fbaFee: 4.10, prices: { priceJSP: 19.99, priceMCF: 21.99, priceWM: 18.99, priceShopify: 22.99, priceFBM: 20.99, priceFBA: 24.99 } },
    { sku: "DEMO-003", name: "Gadget Pro", brand: "TechCo", cost: 25.00, shipping: 7.99, mcfShip: 9.00, mcfFreight: 3.50, fbaFee: 8.75, prices: { priceJSP: 54.99, priceMCF: 57.99, priceWM: 52.99, priceShopify: 59.99, priceFBM: 55.99, priceFBA: 64.99 } },
    { sku: "DEMO-004", name: "Basic Part", brand: "Acme", cost: 3.20, shipping: 2.49, mcfShip: 3.50, mcfFreight: 1.00, fbaFee: 2.80, prices: { priceJSP: 9.99, priceMCF: 11.99, priceWM: 8.99, priceShopify: 12.99, priceFBM: 10.99, priceFBA: 13.99 } },
    { sku: "DEMO-005", name: "Premium Kit", brand: "TechCo", cost: 45.00, shipping: 12.99, mcfShip: 14.00, mcfFreight: 5.00, fbaFee: 12.50, prices: { priceJSP: 99.99, priceMCF: 104.99, priceWM: 94.99, priceShopify: 109.99, priceFBM: 99.99, priceFBA: 119.99 } },
  ];

  const channels = await prisma.salesChannel.findMany({
    where: { customerId: customer.id },
    select: { id: true, priceField: true },
  });

  for (const sp of sampleProducts) {
    const product = await prisma.product.upsert({
      where: { customerId_sku: { customerId: customer.id, sku: sp.sku } },
      update: {},
      create: {
        id: randomUUID(),
        customerId: customer.id,
        sku: sp.sku,
        name: sp.name,
        brand: sp.brand,
      },
    });

    // Cost history
    const existingCost = await prisma.costHistory.findFirst({ where: { productId: product.id } });
    if (!existingCost) {
      await prisma.costHistory.create({
        data: { id: randomUUID(), productId: product.id, cost: sp.cost },
      });
    }

    // Shipping cost history
    const shippingEntries: [string, number][] = [
      ["std", sp.shipping],
      ["mcf_ship", sp.mcfShip],
      ["mcf_freight", sp.mcfFreight],
      ["fba_fee", sp.fbaFee],
    ];
    for (const [shippingType, amount] of shippingEntries) {
      const existing = await prisma.shippingCostHistory.findFirst({
        where: { productId: product.id, shippingType },
      });
      if (!existing) {
        await prisma.shippingCostHistory.create({
          data: { id: randomUUID(), productId: product.id, shippingType, amount },
        });
      }
    }

    // Price history per channel
    for (const ch of channels) {
      const priceVal = (sp.prices as Record<string, number>)[ch.priceField];
      if (priceVal) {
        const existing = await prisma.priceHistory.findFirst({
          where: { productId: product.id, channelId: ch.id },
        });
        if (!existing) {
          await prisma.priceHistory.create({
            data: { id: randomUUID(), productId: product.id, channelId: ch.id, price: priceVal },
          });
        }
      }
    }
  }

  console.log("Seed complete: admin user + demo customer with 6 channels + 5 sample products");
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
