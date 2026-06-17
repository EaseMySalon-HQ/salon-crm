import type { BlogPost } from "@/lib/blog/types"

export const salonInventoryManagement: BlogPost = {
  slug: "salon-inventory-management",
  title: "Salon Inventory Management: Stop Shrinkage and Expiry Waste",
  description:
    "Track colour tubes, retail SKUs, and back-bar stock before shrinkage and expiry eat your margins. A practical inventory guide for Indian salon owners.",
  publishedAt: "February 18, 2026",
  publishedAtIso: "2026-02-18",
  tag: "Operations",
  keywords: [
    "salon inventory management",
    "salon stock shrinkage India",
    "colour tube tracking",
    "salon retail inventory",
    "back-bar stock control",
    "salon expiry management",
    "multi-branch stock transfer",
  ],
  sections: [
    {
      heading: "Why salons bleed inventory silently",
      paragraphs: [
        "Colour tubes opened but not logged, retail sold off-record, back-bar products past expiry, and stylists grabbing stock without updating the register — inventory loss in Indian salons often runs 5–15% of product COGS. On a salon spending ₹80,000 monthly on professional and retail inventory, that is ₹4,000–₹12,000 walking out the door unnoticed.",
        "Spreadsheets break once you pass 50 SKUs or multiple stylists pulling stock without logging. Paper registers get skipped on busy Saturdays in Mumbai and Delhi outlets where reception is juggling billing, phone calls, and walk-in queues simultaneously. Real-time inventory tied to billing closes the loop — every product on a bill deducts stock automatically.",
      ],
    },
    {
      heading: "Separate back-bar, retail, and professional colour stock",
      paragraphs: [
        "Back-bar products used during services — developer, bleach, treatment bowls — should be tracked differently from retail units on the shelf and professional colour tubes charged per client. Mixing categories in one bucket hides whether you are losing retail to theft or overusing colour on services without pricing for it.",
        "Define units of measure clearly: tubes, bottles, millilitres for colour, individual retail units for shampoo sales. Staff understand rules they can follow at chairside — \"Log every opened 60ml tube\" beats vague \"try to track colour\" instructions that nobody follows after week two.",
        "Colour-heavy salons in Delhi and Bangalore often discover that 30% of shrinkage sits in back-bar overuse — stylists mixing extra developer or leaving bowls unlogged. Charging a fair colour service fee that includes standard product usage, with logging for exceptions, protects margin without nickel-and-diming every gram.",
      ],
    },
    {
      heading: "Set par levels and reorder points",
      paragraphs: [
        "Define minimum stock per SKU — six units of your top-selling ₹650 shampoo, twelve tubes of your most-used 20-volume developer, four bottles of bond treatment you cannot run Saturday colour without. Alerts when stock hits reorder point prevent emergency distributor runs that cost time and rush delivery fees.",
        "Salons in high walk-in markets like Mumbai Bandra and Delhi Saket should review par levels quarterly as service mix shifts — more balayage means more lightener; more keratin means more aftercare retail. Billing and inventory software at /features/billing links SKU sales to stock deduction so par level reports reflect reality.",
      ],
    },
    {
      heading: "Track expiry on colour and active skincare",
      paragraphs: [
        "Professional colour, developers, and active-ingredient skincare have shelf life after opening — sometimes 12 months sealed but only weeks after first use. Flag batches nearing expiry and run promotions to move stock before write-off. A ₹2,400 serum past date is pure margin loss plus disposal hassle.",
        "Wastage reports show which categories drain margin fastest — often it is premium colour lines over-ordered because a senior stylist prefers one brand while juniors use another. Standardise where possible or track consumption per stylist to inform ordering.",
      ],
    },
    {
      heading: "Stop shrinkage with checkout discipline",
      paragraphs: [
        "Stylists cannot forget to record a ₹800 serum sale when checkout handles it. Every retail line on the bill reduces shelf stock; complimentary products require manager approval logged in the system. Salons that allow \"just take it, we will bill later\" culture inevitably discover gaps at month-end stock take.",
        "Conduct a monthly spot audit — count top 20 SKUs physically versus system quantity. Discrepancies over 3% trigger a conversation, not a blame session. Often the fix is process — reception too busy to ring retail, colour logged on paper but not entered — not malice.",
        "Commission-linked retail sales improve logging discipline because stylists want credit for serums they recommended. Tie inventory deduction to billing at /features/billing and attach retail lines to the recommending stylist — behaviour changes when earnings depend on it.",
      ],
    },
    {
      heading: "Branch transfers for multi-outlet chains",
      paragraphs: [
        "Outlet A has surplus toner; Outlet B is out before a Saturday bridal rush. Inter-branch transfers with audit trail beat informal \"send a cab with two boxes\" requests that nobody records. Multi-branch salon software at /features/multi-branch tracks movement, updates each location's stock in one action, and preserves GST purchase documentation for your accountant.",
        "Central purchasing for chains in Bangalore and Hyderabad often saves 8–12% on distributor pricing — but only if each branch's consumption is visible. Owners flying blind order the same excess at every outlet while one location stockouts weekly.",
      ],
    },
    {
      heading: "GST and purchase documentation",
      paragraphs: [
        "Every inventory purchase needs a proper GST invoice from your distributor for input tax credit and audit trail. Salons buying cash without documentation pay more in effective tax and cannot prove COGS during scrutiny. Match purchase registers to stock receipts when shipments arrive — not weeks later when the accountant asks.",
        "Retail sales must apply correct GST per HSN at checkout — inventory and billing integration ensures the rate on the shelf matches the rate on the invoice. See our GST for salons guide for rate and compliance detail.",
      ],
    },
    {
      heading: "Make inventory part of daily operations",
      paragraphs: [
        "Assign one person — store manager or senior receptionist — ownership of weekly reorder review and expiry checks. Fifteen minutes every Monday beats a quarterly crisis when you discover ₹25,000 in dead stock. Tie inventory performance to branch P&L reviews alongside service revenue and payroll.",
        "EaseMySalon connects billing, stock, and branch transfers on Growth and Pro plans — explore /pricing to match your outlet count. Inventory discipline is unglamorous but often delivers faster margin improvement than new marketing campaigns for salons already running full on Saturdays.",
        "Pair inventory reviews with growth planning — owners who know COGS per service category can price colour and spa menus confidently instead of copying competitor rate cards that ignore their actual product consumption.",
      ],
    },
  ],
  relatedLinks: [
    { href: "/features/billing", label: "Salon billing & GST invoice software" },
    { href: "/pricing", label: "Salon software pricing" },
  ],
  relatedBlogSlugs: ["gst-for-salons", "grow-salon-business", "salon-staff-commission"],
}
