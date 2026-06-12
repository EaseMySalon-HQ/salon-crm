import type { BlogPost } from "@/lib/blog/types"

export const salonStaffCommission: BlogPost = {
  slug: "salon-staff-commission",
  title: "Salon Staff Commission Structures in India: A Complete Guide",
  description:
    "Flat percentage, tiered targets, or retail bonuses? A practical guide to salon commission structures in India that motivate stylists and protect owner margins.",
  publishedAt: "May 15, 2026",
  publishedAtIso: "2026-05-15",
  tag: "Staff",
  keywords: [
    "salon commission India",
    "stylist commission structure",
    "salon payroll GST",
    "retail upsell commission",
    "salon staff incentives",
    "tiered commission salon",
    "salon billing software",
  ],
  sections: [
    {
      heading: "Why commission structure matters for Indian salons",
      paragraphs: [
        "Pay too little and your best stylists move to the competitor down the road in Bandra or Koramangala within a quarter. Pay without clear rules and margins erode silently — especially when product discounts and complimentary add-ons are not tracked at checkout. Indian salons typically combine a base salary with commission on services (10–40%) and retail (5–15%).",
        "The right model depends on outlet type. A high-volume men's barbershop in Pune operates differently from a premium spa in South Delhi. Walk-in heavy salons need speed-friendly flat rates; appointment-led colour studios need tiered targets that reward ₹1 lakh-plus monthly performers. Document your structure in offer letters and revisit it every quarter against branch P&L.",
      ],
    },
    {
      heading: "Common commission models in Indian salons",
      paragraphs: [
        "Flat rate is the simplest: 30% on all services regardless of category. Easy to explain at hiring, easy to calculate at billing, but it does not differentiate a ₹400 haircut from a ₹6,000 keratin treatment. Many owners use flat rates for junior stylists and graduate to tiered models once staff prove consistency.",
        "Tiered commission rewards high performers: 25% on services up to ₹80,000 monthly revenue, 35% above that threshold. Team pool models work in multi-chair outlets where senior stylists share a branch bonus tied to overall target achievement — useful when collaboration matters more than individual heroics.",
        "Product commission usually sits at 10% on retail sold during or after service. Some Mumbai chains add ₹50–₹200 flat bonus per membership or package sold at the chair. Tie retail attribution to the stylist who recommended the product, not whoever rang up the bill, or upsell behaviour will not change.",
      ],
    },
    {
      heading: "GST, payroll, and legal considerations",
      paragraphs: [
        "Commission is part of taxable income for staff and must flow through proper payroll with TDS where applicable. Pay commission on collected revenue, not booked revenue — you should not owe stylists for no-shows, unpaid credit, or bills voided after a dispute. Your CA can advise on whether commission is calculated pre- or post-GST; be consistent across all staff.",
        "Document structures in appointment letters and internal policy sheets. When a stylist disputes a ₹12,000 payout shortfall, you need a paper trail showing which bills attributed to them and which retail lines qualified. Salons that pay cash under the table for commission create audit risk and staff mistrust in equal measure.",
      ],
    },
    {
      heading: "Service splits, assistants, and colour charges",
      paragraphs: [
        "Colour services often involve a senior stylist and an assistant. Define split rules upfront — 70/30 on labour, senior keeps product markup, or fixed ₹200 assistant fee per colour client. Ambiguity here causes the most commission arguments on payout Friday in busy Delhi salons.",
        "Back-bar product usage should not silently eat commission if you charge clients a colour service fee. Either include product cost in the service price before commission calculation, or track product grams per service and deduct transparently. Stylists accept deductions they can see; they rebel against mystery math.",
      ],
    },
    {
      heading: "Automate calculation at billing",
      paragraphs: [
        "Manual commission spreadsheets break when you scale past five stylists or open a second branch. Attach commission rules to each staff profile and calculate at checkout automatically — service category, retail lines, package redemptions, and membership sales included. EaseMySalon incentive management on Growth and Pro plans handles service splits, product upsell, and branch-level rules without end-of-month Excel marathons.",
        "Test commission accuracy during your software trial on a busy Saturday. Run three sample bills — haircut only, colour plus retail, package redemption — and verify payout matches your policy before going live. Billing software at /features/billing should be the single source of truth for both GST invoices and staff earnings.",
      ],
    },
    {
      heading: "Motivation without destroying margins",
      paragraphs: [
        "Commission should drive behaviour you actually want: rebookings, retail attach, memberships, and referrals — not unlimited discounting to hit personal targets. Cap discount authority per stylist and exclude complimentary services from commission unless you explicitly reward them for client recovery.",
        "Share transparent dashboards so staff see their own numbers daily. Stylists who know they are ₹8,000 from the next tier push harder than those guessing until month-end. Owners who hide numbers breed rumours and resentment.",
      ],
    },
    {
      heading: "Review quarterly against branch profit",
      paragraphs: [
        "Compare total commission payout to branch service revenue monthly. If payroll plus commission exceeds 45% of service revenue consistently, revisit rates or raise prices — the structure may be generous but the business cannot sustain it. Tier-2 city salons often run leaner percentages than Mumbai premium outlets because ticket sizes differ.",
        "Benchmark against industry peers in your city and segment, then adjust for your brand positioning. A budget unisex salon and a luxury bridal studio should not share the same commission sheet even if both use 30% as a starting conversation.",
      ],
    },
    {
      heading: "Choosing software that supports your policy",
      paragraphs: [
        "Any salon management shortlist must include configurable commission rules per staff member, per service category, and per branch. Generic retail POS systems miss stylist attribution, package splits, and assistant sharing — the exact workflows Indian salons fight about every month.",
        "Evaluate total cost on /pricing — plans from ₹199/month per outlet should include commission calculation without per-staff surcharges that punish growing teams. Pair commission automation with appointment booking at /features/appointments so rebooking incentives can be tracked from chair to checkout in one system.",
      ],
    },
  ],
  relatedLinks: [
    { href: "/features/billing", label: "Salon billing & GST invoice software" },
    { href: "/pricing", label: "Salon software pricing in India" },
  ],
  relatedBlogSlugs: ["gst-for-salons", "grow-salon-business", "choose-salon-software"],
}
