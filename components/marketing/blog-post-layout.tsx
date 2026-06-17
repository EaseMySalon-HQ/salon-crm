import Link from "next/link"
import { ArrowRight, Calendar } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BlogPostingSchema, BreadcrumbListSchema } from "@/components/seo/structured-data"
import { getBlogPost, type BlogPost } from "@/lib/blog/posts"

function buildRelatedLinks(post: BlogPost) {
  const blogLinks = (post.relatedBlogSlugs ?? [])
    .map((slug) => {
      const related = getBlogPost(slug)
      return related
        ? { href: `/blog/${slug}`, label: related.title }
        : null
    })
    .filter((link): link is { href: string; label: string } => link !== null)

  const seen = new Set(blogLinks.map((l) => l.href))
  const featureLinks = post.relatedLinks.filter((l) => !seen.has(l.href))
  return [...blogLinks, ...featureLinks]
}

export function BlogPostLayout({ post }: { post: BlogPost }) {
  const relatedLinks = buildRelatedLinks(post)

  return (
    <PublicShell>
      <BlogPostingSchema post={post} />
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Blog", url: "/blog" },
          { name: post.title, url: `/blog/${post.slug}` },
        ]}
      />

      <article className="py-12 lg:py-16">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Badge variant="secondary" className="mb-4">
            {post.tag}
          </Badge>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight">
            {post.title}
          </h1>
          <p className="mt-4 flex items-center gap-2 text-slate-500 text-sm">
            <Calendar className="h-4 w-4" />
            {post.publishedAt}
          </p>
          <p className="mt-6 text-lg text-slate-600 leading-relaxed">{post.description}</p>

          <div className="mt-10 prose prose-slate prose-lg max-w-none">
            {post.sections.map((section) => (
              <section key={section.heading} className="mb-10">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">{section.heading}</h2>
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-slate-700 leading-relaxed mb-4">
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>

          {relatedLinks.length > 0 && (
            <div className="mt-12 pt-8 border-t border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Related resources</h2>
              <ul className="space-y-2">
                {relatedLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-[#7C3AED] font-medium hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-12 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#A855F7] p-8 text-white text-center">
            <h2 className="text-xl font-bold">Ready to put this into practice?</h2>
            <p className="mt-2 text-purple-100">Start your 7-day free trial — plans from ₹199/month per outlet.</p>
            <Button asChild size="lg" className="mt-6 bg-white text-[#7C3AED] hover:bg-gray-100">
              <Link href="/pricing">
                View pricing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </article>
    </PublicShell>
  )
}
