import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { ProjectActions } from "@/components/projects/project-actions";
import { ProjectChannels } from "@/components/projects/project-channels";
import { projectChannelIds } from "@/lib/projects/settings";
import { getPermissions, canAccessCustomer } from "@/lib/permissions";
import { loadAnalysisInputs, withoutCost } from "@/lib/db/analysis-inputs";

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      customer: {
        include: {
          channels: { orderBy: { sortOrder: "asc" } },
        },
      },
      createdBy: { select: { name: true } },
      products: {
        include: {
          product: { select: { id: true, sku: true, name: true, brand: true } },
        },
      },
    },
  });

  if (!project) notFound();

  if (!(await canAccessCustomer(project.customerId, userId, session.user.role))) notFound();

  const permissions = await getPermissions(session.user.role);
  const canViewCost = permissions.has("data:viewCost");

  const customer = project.customer;
  const inputs = await loadAnalysisInputs(customer.id, { projectId });
  if (!inputs) notFound();
  const { channels: channelsData, context } = inputs;
  // Without data:viewCost, cost is stripped here and the analysis is computed on the server.
  const products = canViewCost ? inputs.products : withoutCost(inputs.products);

  const projectProducts = project.products.map((pp) => ({
    productId: pp.productId,
    product: {
      id: pp.product.id,
      sku: pp.product.sku,
      name: pp.product.name,
      brand: pp.product.brand,
    },
  }));

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.description && <p className="text-sm text-gray-600 mt-1">{project.description}</p>}
        </div>
        <div className="flex items-start gap-2">
          {customer.channels.length > 1 && (
            <ProjectChannels
              projectId={projectId}
              customerName={customer.name}
              channels={customer.channels.map((c) => ({ id: c.id, name: c.name }))}
              enabledIds={projectChannelIds(project.settings)}
            />
          )}
          <ProjectActions
            projectId={projectId}
            projectName={project.name}
            customerId={project.customerId}
            status={project.status}
            products={projectProducts}
          />
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-4">
        <Link href={`/customers/${project.customerId}`} className="hover:text-blue-600 transition-colors">
          {customer.name}
        </Link>
        {" · "}
        {products.length} products
        {" · "}
        {channelsData.length < customer.channels.length
          ? `${channelsData.length} of ${customer.channels.length} channels`
          : `${customer.channels.length} channels`}
        {" · "}
        <Badge variant={project.status === "active" ? "default" : "secondary"} className="text-xs">
          {project.status}
        </Badge>
      </div>

      {customer.channels.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No sales channels configured for {customer.name}.</p>
          <p className="text-xs mt-1">
            <Link href={`/customers/${project.customerId}/channels/new`} className="text-blue-600 hover:underline">
              Add a channel
            </Link>{" "}
            to start analyzing.
          </p>
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No products in this project yet.</p>
          <p className="text-xs mt-1">
            Add products from the Product Database. Products must be{" "}
            <a href="/products/import" className="text-blue-600 hover:underline">imported first</a> via Salsify sync or spreadsheet upload.
          </p>
        </div>
      ) : (
        <AnalysisWorkspace
          // Start fresh when the project's channels change.
          key={channelsData.map((c) => c.id).join(",")}
          channels={channelsData}
          products={products}
          brandRoyalties={context.brandRoyalties}
          customerId={project.customerId}
          royaltyRules={context.royaltyRules}
          itemTypeCommissions={context.itemTypeCommissions}
          canViewCost={canViewCost}
          serverCompute={canViewCost ? null : { projectId }}
          canExport={permissions.has("analysis:export")}
          canPublish={permissions.has("salsify:publish") || permissions.has("admin:settings")}
        />
      )}
    </div>
  );
}
