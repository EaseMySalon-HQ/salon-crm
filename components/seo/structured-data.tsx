import { PRICING_PLANS } from "@/lib/pricing-matrix"

const DEFAULT_SITE_URL = "https://www.easemysalon.in"

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL
}

export function OrganizationSchema() {
  const siteUrl = getSiteUrl()

  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "EaseMySalon",
    url: siteUrl,
    logo: `${siteUrl}/images/logo.png`,
    description:
      "India's #1 Salon Management Software - Complete POS, CRM, appointments, inventory & analytics platform for salons and spas.",
    address: {
      "@type": "PostalAddress",
      addressCountry: "IN",
    },
    sameAs: [
      "https://www.linkedin.com/company/easemysalon/",
      "https://www.instagram.com/easemysalon_official/",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+91-6360019041",
      contactType: "Customer Service",
      areaServed: "IN",
      availableLanguage: ["en", "hi"],
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function SoftwareApplicationSchema() {
  const siteUrl = getSiteUrl()
  const prices = PRICING_PLANS.map((p) => p.monthlyInr)
  const lowPrice = Math.min(...prices)
  const highPrice = Math.max(...prices)

  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "EaseMySalon",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android, iOS",
    description:
      "Salon management software for Indian salons — appointments, billing, WhatsApp marketing, staff and multi-branch management.",
    url: `${siteUrl}/`,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: String(lowPrice),
      highPrice: String(highPrice),
      offerCount: String(PRICING_PLANS.length),
      offers: PRICING_PLANS.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: String(plan.monthlyInr),
        priceCurrency: "INR",
        url: `${siteUrl}/pricing`,
      })),
    },
    publisher: {
      "@type": "Organization",
      name: "EaseMySalon",
      url: siteUrl,
      logo: `${siteUrl}/images/logo.png`,
      address: {
        "@type": "PostalAddress",
        addressCountry: "IN",
      },
    },
    featureList: [
      "Salon POS System with GST",
      "Appointment Booking Software",
      "Salon CRM & Client Management",
      "Inventory Management",
      "Staff Management & Commission Tracking",
      "Salon Analytics & Reports",
      "WhatsApp Integration",
      "Multi-location Support",
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function FAQSchema({ faqs }: { faqs: Array<{ question: string; answer: string }> }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export interface BlogPostingSchemaInput {
  slug: string
  title: string
  description: string
  publishedAtIso: string
  tag: string
}

export function BlogPostingSchema({ post }: { post: BlogPostingSchemaInput }) {
  const siteUrl = getSiteUrl()

  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAtIso,
    dateModified: post.publishedAtIso,
    author: {
      "@type": "Organization",
      name: "EaseMySalon",
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "EaseMySalon",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/images/logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteUrl}/blog/${post.slug}`,
    },
    image: `${siteUrl}/images/dashboard.png`,
    articleSection: post.tag,
    inLanguage: "en-IN",
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function BreadcrumbListSchema({ items }: { items: Array<{ name: string; url: string }> }) {
  const siteUrl = getSiteUrl()

  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.url}`,
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
