import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { canAccessCustomer, getPermissions } from "@/lib/permissions";
import { loadAnalysisInputs, withoutCost } from "@/lib/db/analysis-inputs";

export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ channel?: string; tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { customerId } = await params;
  const { channel: channelParam, tab } = await searchParams;

  const permissions = await getPermissions(session.user.role);
  const canViewCost = permissions.has("data:viewCost");
  if (!(await canAccessCustomer(customerId, userId, session.user.role))) notFound();

  const inputs = await loadAnalysisInputs(customerId, { channelId: channelParam });
  if (!inputs) notFound();
  const { customer, singleChannel, channels, context } = inputs;
  // Without data:viewCost, cost is stripped here and the analysis is computed on the server.
  const products = canViewCost ? inputs.products : withoutCost(inputs.products);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-4">
        {singleChannel ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">
              {customer.name} — {singleChannel.name} Analysis
            </h1>
            <p className="text-sm text-gray-500">
              {products.length} products
              {singleChannel.salsifyListId && " from this channel's Salsify list"}
              {" · "}
              <Link href={`/customers/${customerId}/analysis`} className="text-blue-600 hover:underline">
                All channels
              </Link>
              {" · "}
              <Link
                href={`/customers/${customerId}/channels/${singleChannel.id}`}
                className="text-blue-600 hover:underline"
              >
                Channel settings
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name} — Analysis</h1>
            <p className="text-sm text-gray-500">
              {products.length} products across {customer.channels.length} channels
            </p>
          </>
        )}
      </div>

      <AnalysisWorkspace
        channels={channels}
        products={products}
        brandRoyalties={context.brandRoyalties}
        customerId={customerId}
        royaltyRules={context.royaltyRules}
        itemTypeCommissions={context.itemTypeCommissions}
        openPublish={tab === "publish"}
        canViewCost={canViewCost}
        canExport={permissions.has("analysis:export")}
        serverCompute={canViewCost ? null : { singleChannel: !!singleChannel }}
      />
    </div>
  );
}
