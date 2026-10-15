import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getPermissions, productVisibilityWhere } from "@/lib/permissions";
import { SingleSkuWizard } from "@/components/single-sku/single-sku-wizard";

export default async function SingleSkuPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const permissions = await getPermissions(session.user.role);
  if (!permissions.has("module:singleSku")) redirect("/dashboard");
  const isAdmin = permissions.has("admin:settings");

  const customers = await prisma.customer.findMany({
    where: isAdmin ? {} : { users: { some: { userId: session.user.id } } },
    select: {
      id: true,
      name: true,
      channels: { select: { id: true, name: true, channelType: true, isDefault: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  // Opened from a product page: start with that SKU picked.
  const { productId } = await searchParams;
  const startProduct =
    typeof productId === "string" && productId
      ? await prisma.product.findFirst({
          where: { id: productId, ...(await productVisibilityWhere(session.user.id, session.user.role)) },
          select: {
            id: true,
            sku: true,
            name: true,
            brand: true,
            customers: { where: { customerId: { in: customers.map((c) => c.id) } }, select: { customerId: true } },
          },
        })
      : null;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Single SKU Analysis</h1>
        <p className="text-sm text-gray-500 mt-1">
          Price one SKU across a customer&apos;s channels. Adjust cost, shipping and each channel&apos;s allocations to see the
          margin change.
        </p>
      </div>
      <SingleSkuWizard
        customers={customers}
        canExport={permissions.has("analysis:export")}
        startProduct={
          startProduct && {
            id: startProduct.id,
            sku: startProduct.sku,
            name: startProduct.name,
            brand: startProduct.brand,
            customerIds: startProduct.customers.map((c) => c.customerId),
          }
        }
      />
    </div>
  );
}
