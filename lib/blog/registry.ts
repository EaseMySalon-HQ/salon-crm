import type { BlogPost } from "@/lib/blog/types"
import { chooseSalonSoftware } from "@/lib/blog/articles/choose-salon-software"
import { digitalMarketingSalonsIndia } from "@/lib/blog/articles/digital-marketing-salons-india"
import { growSalonBusiness } from "@/lib/blog/articles/grow-salon-business"
import { gstForSalons } from "@/lib/blog/articles/gst-for-salons"
import { openSecondSalonBranch } from "@/lib/blog/articles/open-second-salon-branch"
import { reduceSalonNoShows } from "@/lib/blog/articles/reduce-salon-no-shows"
import { salonClientRetention } from "@/lib/blog/articles/salon-client-retention"
import { salonFeedbackNps } from "@/lib/blog/articles/salon-feedback-nps"
import { salonInventoryManagement } from "@/lib/blog/articles/salon-inventory-management"
import { salonLoyaltyProgramsIndia } from "@/lib/blog/articles/salon-loyalty-programs-india"
import { salonMembershipPackages } from "@/lib/blog/articles/salon-membership-packages"
import { salonPeakHourStaffing } from "@/lib/blog/articles/salon-peak-hour-staffing"
import { salonStaffCommission } from "@/lib/blog/articles/salon-staff-commission"
import { upiDigitalPaymentsSalon } from "@/lib/blog/articles/upi-digital-payments-salon"
import { weddingSeasonSalonMarketing } from "@/lib/blog/articles/wedding-season-salon-marketing"

export const BLOG_POSTS: BlogPost[] = [
  reduceSalonNoShows,
  salonStaffCommission,
  gstForSalons,
  growSalonBusiness,
  salonInventoryManagement,
  salonLoyaltyProgramsIndia,
  chooseSalonSoftware,
  salonMembershipPackages,
  digitalMarketingSalonsIndia,
  salonClientRetention,
  openSecondSalonBranch,
  salonPeakHourStaffing,
  upiDigitalPaymentsSalon,
  salonFeedbackNps,
  weddingSeasonSalonMarketing,
]

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}

export function getAllBlogSlugs(): string[] {
  return BLOG_POSTS.map((p) => p.slug)
}
