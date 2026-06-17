import type { BlogPost } from "@/lib/blog/types"

export const gstForSalons: BlogPost = {
  slug: "gst-for-salons",
  title: "GST for Salons in India: Rates, Billing & Compliance",
  description:
    "GST rates, invoicing rules, and record-keeping for Indian salons — services vs retail, composition scheme, and how billing software keeps you audit-ready.",
  publishedAt: "April 20, 2026",
  publishedAtIso: "2026-04-20",
  tag: "Compliance",
  keywords: [
    "GST for salons India",
    "salon GST rate 18%",
    "beauty parlour GST billing",
    "salon tax invoice",
    "GSTR-1 salon",
    "salon HSN code",
    "GST compliant salon software",
  ],
  sections: [
    {
      heading: "GST rates for salon services and products",
      paragraphs: [
        "Beauty and grooming services in India generally attract 18% GST. Haircuts, facials, waxing, manicures, and salon treatments fall under service categories that most CAs classify at the standard rate unless a specific exemption applies to your service mix. Always confirm classification with your accountant — do not rely on word-of-mouth from another salon owner in a different state.",
        "Personal care products sold at retail may fall under different slabs — 5%, 12%, or 18% depending on HSN classification, product type, and whether you sell as a retailer or bundle with service. Mixed bills with a ₹800 haircut plus ₹1,200 shampoo purchase need separate tax lines with correct rates per item. Generic billing apps often apply one flat rate and create compliance gaps that surface during scrutiny.",
      ],
    },
    {
      heading: "What a compliant salon tax invoice must include",
      paragraphs: [
        "Every tax invoice needs your legal business name, address, GSTIN, sequential invoice number, date, client name, itemised services and products, taxable value, CGST and SGST for intra-state sales or IGST for inter-state, and total amount in figures and words where required. B2B corporate grooming contracts in Mumbai and Bangalore often need the client's GSTIN captured for their input tax credit.",
        "Salon-specific software at /features/billing applies GST per service category and SKU automatically, which is critical when front-desk staff are rushing through Saturday checkout queues. Manual rate lookup slows billing and invites errors that compound across hundreds of monthly invoices.",
      ],
    },
    {
      heading: "Composition scheme vs regular GST registration",
      paragraphs: [
        "Small salons under the composition scheme face different rules — you typically cannot issue full tax invoices that allow clients to claim input credit the same way a regular registrant does. Many growing outlets in Delhi, Pune, and Chennai register under regular GST for credibility with corporate clients and to claim input credit on professional product purchases from distributors.",
        "Threshold limits and eligibility change — consult your CA before choosing or switching schemes. A salon doing ₹25 lakh annual turnover with heavy B2B corporate billing usually benefits from regular registration even if composition looks simpler on paper.",
      ],
    },
    {
      heading: "Input tax credit on salon purchases",
      paragraphs: [
        "Regular GST registrants can claim input tax credit on eligible business purchases — professional colour lines, retail inventory, equipment, and software subscriptions if properly documented. Missing supplier invoices or buying from unregistered vendors limits credit and silently raises effective product cost.",
        "Train your store manager to collect GST invoices from every distributor delivery. Match purchase registers to GSTR-2B reconciliation monthly rather than discovering ₹40,000 in disallowed credit at year-end filing.",
      ],
    },
    {
      heading: "Record-keeping for audits and GSTR filing",
      paragraphs: [
        "Maintain digital records of every bill, credit note, debit note, and purchase invoice. Export monthly summaries for GSTR-1 filing and reconcile with payment gateway and UPI settlement reports. Billing software that stores GST breakdown per transaction saves hours at month-end versus reconstructing totals from cash register tapes.",
        "Credit notes matter when clients return retail products or you void a service bill — your system must handle reversals with proper tax lines, not informal cash refunds off the books. Auditors in Karnataka and Maharashtra increasingly ask for POS-level detail, not just accountant summaries.",
        "Set a monthly calendar reminder for GSTR-1 preparation — the 11th of the following month arrives quickly when you are managing staff rosters and festive promotions. Software exports turn a two-day reconstruction job into a one-hour review with your CA.",
      ],
    },
    {
      heading: "Common GST mistakes Indian salons make",
      paragraphs: [
        "Applying 18% to all retail regardless of HSN, issuing invoices without GSTIN on B2B bills, skipping tax on complimentary services that should be treated as taxable supplies, and mixing personal expenses through the salon GSTIN are frequent errors. Another is paying stylists commission on pre-tax amounts while reporting revenue post-discount inconsistently.",
        "Package and membership sales have specific revenue recognition and GST treatment depending on how you structure prepayment — issue tax invoices at sale or redemption per your CA's advice. Prepaid bridal packages worth ₹25,000 need clear documentation, not a handwritten receipt.",
      ],
    },
    {
      heading: "Digital payments and GST invoices together",
      paragraphs: [
        "UPI and card payments do not replace the need for a tax invoice. Corporate clients, wedding planners, and expense-claiming professionals still need GST bills regardless of whether they paid via PhonePe or cash. Generate the invoice at payment completion every time — see our guide on UPI at the salon front desk for reconciliation tips.",
        "Split payments — ₹700 UPI plus ₹500 cash on a ₹1,200 bill — should still produce one invoice with correct tax lines. Billing software records tender type and tax in a single transaction for cleaner GSTR alignment.",
      ],
    },
    {
      heading: "How salon billing software keeps you compliant",
      paragraphs: [
        "Configure GST per service category and product SKU once, then let checkout apply rates automatically. Export GSTR-ready summaries for your accountant, maintain sequential invoice numbering, and store client GSTIN for repeat corporate visits. Salons across Delhi, Bangalore, Hyderabad, and tier-2 cities use EaseMySalon to stay audit-ready without slowing the front desk.",
        "Compare plans at /pricing — GST-compliant billing is a baseline feature, not an expensive add-on. During software evaluation, test a mixed service-plus-retail bill and verify CGST/SGST split before you commit; compliance failures are far costlier than a few hundred rupees in monthly subscription difference.",
        "Salon owners evaluating software should read our buyer's checklist alongside this GST guide — compliance and usability at the front desk matter equally when Saturday queue length is your real stress test.",
      ],
    },
  ],
  relatedLinks: [
    { href: "/features/billing", label: "Salon billing & GST invoice software" },
    { href: "/faq", label: "Salon software FAQ" },
  ],
  relatedBlogSlugs: ["salon-staff-commission", "upi-digital-payments-salon", "choose-salon-software"],
}
