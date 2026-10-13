import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getPermissions } from "@/lib/permissions";
import { HELP_GROUPS, visibleArticles } from "@/lib/help/articles";
import { HelpBlocks } from "@/components/help/help-content";
import { cn } from "@/lib/utils";

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { slug } = await params;
  const articles = visibleArticles(await getPermissions(session.user.role));
  const article = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Link href="/help" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Help &amp; Docs
      </Link>
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_200px] gap-8 items-start">
        {/* All topics */}
        <nav className="hidden lg:block lg:sticky lg:top-6 space-y-5" aria-label="Help topics">
          {HELP_GROUPS.map((group) => {
            const inGroup = articles.filter((a) => a.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{group}</p>
                <ul className="space-y-0.5">
                  {inGroup.map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={`/help/${a.slug}`}
                        className={cn(
                          "block rounded-md px-2 py-1 text-sm",
                          a.slug === article.slug ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-100",
                        )}
                      >
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Article */}
        <article className="min-w-0 rounded-lg border border-gray-200 bg-white p-6 md:p-8">
          <h1 className="text-2xl font-bold text-gray-900">{article.title}</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">{article.summary}</p>
          <div className="space-y-10">
            {article.sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">{s.title}</h2>
                <HelpBlocks blocks={s.blocks} />
              </section>
            ))}
          </div>
        </article>

        {/* On this page */}
        {article.sections.length > 1 && (
          <nav className="hidden lg:block lg:sticky lg:top-6" aria-label="On this page">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">On this page</p>
            <ul className="space-y-1">
              {article.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-sm text-gray-600 hover:text-blue-600">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
