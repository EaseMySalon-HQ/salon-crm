export interface BlogSection {
  heading: string
  paragraphs: string[]
}

export interface BlogPost {
  slug: string
  title: string
  description: string
  /** Human-readable date for display */
  publishedAt: string
  /** ISO 8601 for schema and Open Graph */
  publishedAtIso: string
  tag: string
  keywords: string[]
  sections: BlogSection[]
  relatedLinks: Array<{ href: string; label: string }>
  relatedBlogSlugs?: string[]
}
