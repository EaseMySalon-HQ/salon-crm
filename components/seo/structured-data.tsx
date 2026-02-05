export function OrganizationSchema() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://easemysalon.com'
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Ease My Salon",
    "url": siteUrl,
    "logo": `${siteUrl}/images/logo.png`,
    "description": "India's #1 Salon Management Software - Complete POS, CRM, appointments, inventory & analytics platform for salons and spas. Reduce no-shows by 40%, cut billing time by 70%, increase revenue by 35%.",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "IN"
    },
    "sameAs": [
      "https://www.linkedin.com/company/easemysalon/",
      "https://www.instagram.com/easemysalon_official/"
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": "+91-6360019041",
      "contactType": "Customer Service",
      "areaServed": "IN",
      "availableLanguage": ["en", "hi"]
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function SoftwareApplicationSchema() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://easemysalon.com'
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Ease My Salon",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "999",
      "priceCurrency": "INR",
      "priceValidUntil": "2025-12-31",
      "availability": "https://schema.org/InStock",
      "url": `${siteUrl}/pricing`
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "350"
    },
    "description": "Complete salon management software with POS, CRM, appointment booking, inventory management, staff management, and analytics. Built for Indian salons and spas.",
    "featureList": [
      "Salon POS System with GST",
      "Appointment Booking Software",
      "Salon CRM & Client Management",
      "Inventory Management",
      "Staff Management & Commission Tracking",
      "Salon Analytics & Reports",
      "WhatsApp Integration",
      "Multi-location Support"
    ]
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
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function BreadcrumbListSchema({ items }: { items: Array<{ name: string; url: string }> }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://easemysalon.com'
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": `${siteUrl}${item.url}`
    }))
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
