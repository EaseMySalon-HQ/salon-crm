import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BlogPostLayout } from "@/components/marketing/blog-post-layout"
import { BLOG_DEFAULT_OG_IMAGE } from "@/lib/blog/constants"
import { BLOG_POSTS, getAllBlogSlugs, getBlogPost } from "@/lib/blog/posts"

export function generateStaticParams() {
  return getAllBlogSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return {}

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      publishedTime: post.publishedAtIso,
      section: post.tag,
      title: post.title,
      description: post.description,
      url: `/blog/${slug}`,
      images: [
        {
          url: BLOG_DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [BLOG_DEFAULT_OG_IMAGE],
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()

  return <BlogPostLayout post={post} />
}
