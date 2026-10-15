import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPermissions } from "@/lib/permissions";
import { HELP_GROUPS, visibleArticles } from "@/lib/help/articles";
import { blockText } from "@/lib/help/types";
import { ARTICLE_ICONS } from "@/components/help/help-content";
import { HelpSearch } from "@/components/help/help-search";

export default async function HelpPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const articles = visibleArticles(await getPermissions(session.user.role));

  const entries = articles.flatMap((a) =>
    a.sections.map((s) => ({
      slug: a.slug,
      articleTitle: a.title,
      sectionId: s.id,
      sectionTitle: s.title,
      text: s.blocks.map(blockText).join(" "),
    })),
  );

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Help &amp; Docs</h1>
        <p className="text-sm text-gray-500 mt-1">How to use the platform. Topics match what your role can do.</p>
      </div>
      <HelpSearch entries={entries}>
        <div className="space-y-8">
          {HELP_GROUPS.map((group) => {
            const inGroup = articles.filter((a) => a.group === group);
            if (inGroup.length === 0) return null;
            return (
              <section key={group}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">{group}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inGroup.map((a) => {
                    const Icon = ARTICLE_ICONS[a.icon] ?? ARTICLE_ICONS.HelpCircle;
                    return (
                      <Link
                        key={a.slug}
                        href={`/help/${a.slug}`}
                        className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                            <Icon className="h-5 w-5 text-blue-600 shrink-0" />
                          </div>
                          <p className="font-medium text-gray-900">{a.title}</p>
                        </div>
                        <p className="text-sm text-gray-500">{a.summary}</p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </HelpSearch>
    </div>
  );
}
