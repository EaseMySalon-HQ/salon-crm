import type { Metadata } from "next"
import { PublicBookingPage } from "@/components/public-booking/public-booking-page"

type PageProps = {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  return {
    title: `Book appointment · ${code.toUpperCase()}`,
    description: "Book salon services online with EaseMySalon.",
    robots: { index: false, follow: false },
  }
}

export default async function BookPage({ params }: PageProps) {
  const { code } = await params
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-purple-50/30">
      <PublicBookingPage code={code} />
    </div>
  )
}
