import type { Metadata } from "next"
import { PublicBookingPage } from "@/components/public-booking/public-booking-page"

type PageProps = {
  params: Promise<{ code: string }>
  searchParams: Promise<{ service?: string; package?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  return {
    title: `Book appointment · ${code.toUpperCase()}`,
    description: "Book salon services online with EaseMySalon.",
    robots: { index: false, follow: false },
  }
}

export default async function BookPage({ params, searchParams }: PageProps) {
  const { code } = await params
  const query = await searchParams
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-purple-50/30">
      <PublicBookingPage
        code={code}
        initialServiceId={query.service || null}
        initialPackageId={query.package || null}
      />
    </div>
  )
}
