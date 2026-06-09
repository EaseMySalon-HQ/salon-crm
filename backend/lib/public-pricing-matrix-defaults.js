/** Default public /pricing feature matrix — seeded when no admin override exists. */
const DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES = [
  {
    title: 'Appointments & scheduling',
    rows: [
      { feature: 'Appointment booking', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'Calendar management', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'Walk-in management', starter: 'yes', growth: 'yes', pro: 'yes' },
      {
        feature: 'Booking via WhatsApp',
        hint: 'Clients book directly in chat',
        starter: 'yes',
        growth: 'yes',
        pro: 'yes',
      },
    ],
  },
  {
    title: 'Billing & payments',
    rows: [
      { feature: 'GST billing & invoicing', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'Payment tracking', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'Expense management', starter: 'yes', growth: 'yes', pro: 'yes' },
    ],
  },
  {
    title: 'Staff & operations',
    rows: [
      { feature: 'Staff management', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'Attendance & leaves', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'Incentive management', starter: 'no', growth: 'yes', pro: 'yes' },
      { feature: 'Inventory management', starter: 'yes', growth: 'yes', pro: 'yes' },
    ],
  },
  {
    title: 'Client management',
    rows: [
      { feature: 'Client records (CRM)', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'Service history per client', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'Birthday & anniversary tracking', starter: 'yes', growth: 'yes', pro: 'yes' },
      {
        feature: 'Auto birthday/anniversary offers',
        hint: 'Triggered promotions sent automatically',
        starter: 'yes',
        growth: 'yes',
        pro: 'yes',
      },
    ],
  },
  {
    title: 'Reports & analytics',
    rows: [
      { feature: 'Basic dashboard', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'Sales & revenue reports', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'Staff performance scoring', starter: 'yes', growth: 'yes', pro: 'yes' },
      { feature: 'NPS & feedback analytics', starter: 'no', growth: 'yes', pro: 'yes' },
      {
        feature: 'Campaign analytics',
        hint: 'Open rate, CTR, conversions',
        starter: 'no',
        growth: 'yes',
        pro: 'yes',
      },
      { feature: 'Advanced custom reports', starter: 'no', growth: 'no', pro: 'yes' },
    ],
  },
  {
    title: 'Feedback management',
    rows: [
      {
        feature: 'Post-visit feedback collection',
        hint: 'Auto-sent after each appointment',
        starter: 'no',
        growth: 'yes',
        pro: 'yes',
      },
      { feature: 'Feedback management settings', starter: 'no', growth: 'yes', pro: 'yes' },
      {
        feature: 'Negative reviewer alerts',
        hint: 'Instant owner notification',
        starter: 'no',
        growth: 'yes',
        pro: 'yes',
      },
      {
        feature: 'Google review nudges',
        hint: 'Auto-prompt happy clients to review',
        starter: 'no',
        growth: 'yes',
        pro: 'yes',
      },
      { feature: 'NPS dashboard', starter: 'no', growth: 'yes', pro: 'yes' },
    ],
  },
  {
    title: 'Loyalty management',
    rows: [
      { feature: 'Points & rewards engine', starter: 'no', growth: 'yes', pro: 'yes' },
      { feature: 'Reward points settings', starter: 'no', growth: 'yes', pro: 'yes' },
      {
        feature: 'Tiered memberships',
        hint: 'Silver / Gold / Platinum',
        starter: 'no',
        growth: 'yes',
        pro: 'yes',
      },
      { feature: 'Referral program', starter: 'no', growth: 'yes', pro: 'yes' },
    ],
  },
  {
    title: 'WhatsApp (WABA) integration',
    rows: [
      {
        feature: 'Appointment reminders',
        hint: 'Auto-sent before visits',
        starter: 'no',
        growth: 'addon',
        pro: 'yes',
      },
      { feature: 'Broadcast promotions', starter: 'no', growth: 'addon', pro: 'yes' },
      { feature: 'Two-way chat from dashboard', starter: 'no', growth: 'addon', pro: 'yes' },
      { feature: 'Booking via WhatsApp', starter: 'no', growth: 'addon', pro: 'yes' },
    ],
  },
  {
    title: 'Support & limits',
    rows: [
      { feature: 'Appointments per month', starter: 'Unlimited', growth: 'Unlimited', pro: 'Unlimited' },
      { feature: 'Client records', starter: 'Unlimited', growth: 'Unlimited', pro: 'Unlimited' },
      { feature: 'Staff accounts', starter: 'Unlimited', growth: 'Unlimited', pro: 'Unlimited' },
      { feature: 'Multi-branch management', starter: 'no', growth: 'no', pro: 'yes' },
      { feature: 'Customer support', starter: 'Email', growth: 'Email + chat', pro: 'Priority' },
    ],
  },
];

module.exports = { DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES };
