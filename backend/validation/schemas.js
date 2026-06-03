/**
 * Zod schemas for request validation.
 * Prefer .strict() on new boundaries; use .passthrough() where legacy clients send extra keys.
 */

const { z } = require('zod');

const emailSchema = z.string().trim().email().max(320);

/** 24-char hex MongoDB ObjectId string */
const objectIdHex = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');

const tenantLoginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(512),
  })
  .strict();

const staffLoginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(512),
    businessCode: z.string().trim().min(1).max(64),
  })
  .strict();

const adminLoginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(512),
  })
  .strict();

const adminSettingsCategorySchema = z.enum([
  'system',
  'business',
  'users',
  'database',
  'notifications',
  'api',
  'invoice',
]);

const adminSettingsCategoryParamSchema = z
  .object({
    category: adminSettingsCategorySchema,
  })
  .strict();

const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

const resetPasswordSchema = z
  .object({
    token: z.string().min(10).max(512),
    newPassword: z.string().min(6).max(512),
  })
  .strict();

// --- Shared param schemas ---

const mongoIdParamSchema = z.object({ id: objectIdHex }).strict();

const bookingIdParamSchema = z.object({ bookingId: objectIdHex }).strict();

// --- Customers (clients) ---

const whatsappConsentInputSchema = z
  .object({
    optedIn: z.boolean().optional(),
    source: z
      .enum(['booking', 'checkout', 'manual', 'import', 'staff', 'inbound_message', 'system'])
      .optional(),
    /**
     * Reasons can come from the form as `null` when the inverse toggle is
     * being unset (e.g. opting in clears `optOutReason`). Accept null AND
     * undefined so the form's "clear the other side" pattern doesn't make
     * the whole update fail with 400.
     */
    optInReason: z.string().max(500).nullable().optional(),
    optOutReason: z.string().max(500).nullable().optional(),
  })
  .strict()
  .optional();

const createClientBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(5).max(32),
    email: z.union([emailSchema, z.literal('')]).optional(),
    address: z.string().max(2000).optional(),
    notes: z.string().max(5000).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    dob: z.union([z.string(), z.date()]).optional(),
    whatsappConsent: whatsappConsentInputSchema,
  })
  .passthrough();

/** Update allows partial fields; unknown keys preserved for Mongoose updates. */
const updateClientBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(5).max(32).optional(),
    email: z.union([emailSchema, z.literal('')]).optional(),
    address: z.string().max(2000).optional(),
    notes: z.string().max(5000).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    dob: z.union([z.string(), z.date()]).optional(),
    whatsappConsent: whatsappConsentInputSchema,
  })
  .passthrough();

// --- Staff ---

const createStaffBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: emailSchema,
    phone: z.string().trim().min(5).max(32),
    role: z.enum(['admin', 'manager', 'staff']),
    specialties: z.array(z.string().max(120)).optional(),
    salary: z.union([z.coerce.number().min(0), z.string()]).optional(),
    commissionProfileIds: z.array(z.string().max(64)).optional(),
    notes: z.string().max(5000).optional(),
    hasLoginAccess: z.boolean().optional(),
    allowAppointmentScheduling: z.boolean().optional(),
    password: z.string().min(1).max(512).optional(),
    isActive: z.boolean().optional(),
    workSchedule: z
      .array(
        z
          .object({
            day: z.coerce.number().int().min(0).max(6),
            enabled: z.boolean().optional(),
            startTime: z.string().max(8).optional(),
            endTime: z.string().max(8).optional(),
          })
          .strict()
      )
      .optional(),
    avatar: z.string().max(7_000_000).optional(),
  })
  .strict();

/** PUT /staff/:id — partial updates (permissions-only, schedule-only, profile); extra keys allowed. */
const staffUpdateBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().max(320).optional(),
    phone: z.string().min(5).max(32).optional(),
    role: z.enum(['admin', 'manager', 'staff']).optional(),
    specialties: z.array(z.string()).optional(),
    salary: z.union([z.coerce.number(), z.string()]).optional(),
    commissionProfileIds: z.array(z.string()).optional(),
    notes: z.string().optional(),
    hasLoginAccess: z.boolean().optional(),
    allowAppointmentScheduling: z.boolean().optional(),
    password: z.string().optional(),
    isActive: z.boolean().optional(),
    workSchedule: z.array(z.unknown()).optional(),
    permissions: z.array(z.unknown()).optional(),
    permissionsTemplate: z.string().nullable().optional(),
    avatar: z.string().max(7_000_000).optional(),
  })
  .passthrough();

const staffChangePasswordBodySchema = z
  .object({
    newPassword: z.string().min(6).max(512),
  })
  .strict();

// --- Billing / sales ---

const salePaymentBodySchema = z
  .object({
    amount: z.coerce.number().positive(),
    method: z.string().trim().min(1).max(64),
    notes: z.string().max(2000).optional(),
    collectedBy: z.string().max(200).optional(),
  })
  .strict();

/** Bill exchange — reason required; items optional (defaults to existing sale items). */
const saleExchangeBodySchema = z
  .object({
    editReason: z.string().trim().min(1).max(2000),
    items: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();

// --- Tenant users (main DB) ---

const createUserBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100).optional(),
    email: emailSchema,
    mobile: z.string().trim().min(5).max(32),
    password: z.string().min(1).max(512).optional(),
    hasLoginAccess: z.boolean().optional(),
    allowAppointmentScheduling: z.boolean().optional(),
    commissionProfileIds: z.array(z.string()).optional(),
  })
  .strict();

const updateUserBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100).optional(),
    email: z.union([emailSchema, z.literal('')]).optional(),
    password: z.string().optional(),
    mobile: z.string().trim().min(5).max(32),
    hasLoginAccess: z.boolean().optional(),
    allowAppointmentScheduling: z.boolean().optional(),
    commissionProfileIds: z.array(z.string()).optional(),
    avatar: z.string().optional(),
    role: z.enum(['admin', 'staff']).optional(),
  })
  .passthrough();

const userChangePasswordBodySchema = z
  .object({
    newPassword: z.string().min(1).max(512),
  })
  .strict();

const verifyAdminPasswordBodySchema = z
  .object({
    password: z.string().min(1).max(512),
  })
  .strict();

// --- Expenses ---

const expenseCategorySchema = z.enum([
  'Supplies',
  'Equipment',
  'Utilities',
  'Marketing',
  'Rent',
  'Insurance',
  'Maintenance',
  'Professional Services',
  'Travel',
  'Other',
]);

const expensePaymentModeSchema = z.enum([
  'Cash',
  'Card',
  'Bank Transfer',
  'UPI',
  'Cheque',
  'Petty Cash Wallet',
]);

const createExpenseBodySchema = z
  .object({
    category: expenseCategorySchema,
    paymentMode: expensePaymentModeSchema,
    description: z.string().max(200).optional(),
    amount: z.coerce.number().min(0),
    date: z.union([z.string(), z.coerce.date()]).optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    vendor: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    approvedBy: z.string().max(200).optional(),
  })
  .strict();

const updateExpenseBodySchema = z
  .object({
    category: expenseCategorySchema.optional(),
    paymentMode: expensePaymentModeSchema.optional(),
    description: z.string().max(200).optional(),
    amount: z.coerce.number().min(0).optional(),
    date: z.union([z.string(), z.coerce.date()]).optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    vendor: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    approvedBy: z.string().max(200).optional(),
  })
  .passthrough();

// --- Bookings (parent router) ---

const bookingSlotHoldBodySchema = z
  .object({
    clientId: z.string().min(1).max(64),
    staffId: z.string().min(1).max(64),
    startAt: z.union([z.string(), z.number()]),
    endAt: z.union([z.string(), z.number()]),
    ttlMinutes: z.number().optional(),
    bookingId: z.string().optional(),
  })
  .strict();

/** Large nested payload validated in booking-service; allow any top-level keys. */
const bookingCreateBodySchema = z.object({}).passthrough();

// --- Packages (tenant) — create has strict core fields; nested pricing validated in service ---

const packageCreateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(5000).optional(),
    type: z.enum(['FIXED', 'CUSTOMIZED']),
    total_price: z.coerce.number().min(0),
    discount_amount: z.coerce.number().min(0).optional(),
    discount_type: z.enum(['FLAT', 'PERCENT']).nullable().optional(),
    total_sittings: z.coerce.number().int().min(1).optional(),
    min_service_count: z.coerce.number().int().min(0).optional(),
    max_service_count: z.coerce.number().int().min(0).optional(),
    validity_days: z.coerce.number().int().min(0).nullable().optional(),
    cross_branch_redemption: z.boolean().optional(),
    services: z.array(z.record(z.string(), z.unknown())).min(1),
    image_url: z.union([z.string().url(), z.literal('')]).optional(),
    status: z.string().max(32).optional(),
    branch_ids: z.array(z.string()).optional(),
  })
  .passthrough();

// --- Platform admin access (params) ---

const roleIdParamSchema = z.object({ roleId: objectIdHex }).strict();

const adminUserIdParamSchema = z.object({ userId: objectIdHex }).strict();

const adminRoleCreateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).optional(),
    permissions: z.array(z.record(z.string(), z.unknown())).min(1),
    color: z.string().max(32).optional(),
  })
  .strict();

const adminRoleUpdateBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    permissions: z.array(z.record(z.string(), z.unknown())).optional(),
    color: z.string().max(32).optional(),
  })
  .passthrough();

// ──────────────────────────────────────────────────────────────────────────
// GST reports
// ──────────────────────────────────────────────────────────────────────────

const gstPeriodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must be YYYY-MM');

const gstSourceSchema = z.enum(['wallet', 'plan', 'all']);
const gstProviderSchema = z.enum(['razorpay', 'stripe', 'zoho', 'system', 'all']);
const gstStatusSchema = z.enum(['generated', 'reported', 'filed', 'all']);
const gstBuyerTypeSchema = z.enum(['B2B', 'B2C', 'all']);

// ISO date string (YYYY-MM-DD) or empty.
const gstDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const gstInvoicesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    from: gstDateSchema.optional(),
    to: gstDateSchema.optional(),
    period: gstPeriodSchema.optional(),
    source: gstSourceSchema.optional(),
    provider: gstProviderSchema.optional(),
    status: gstStatusSchema.optional(),
    buyerType: gstBuyerTypeSchema.optional(),
    search: z.string().trim().max(200).optional(),
  })
  .strict();

const gstSummaryQuerySchema = z
  .object({
    period: gstPeriodSchema.optional(),
  })
  .strict();

const gstExportBodySchema = z
  .object({
    from: gstDateSchema.optional(),
    to: gstDateSchema.optional(),
    period: gstPeriodSchema.optional(),
    source: gstSourceSchema.optional(),
    provider: gstProviderSchema.optional(),
    status: gstStatusSchema.optional(),
    buyerType: gstBuyerTypeSchema.optional(),
    search: z.string().trim().max(200).optional(),
    format: z.enum(['csv', 'xlsx', 'gstr1', 'gstr1_json']).default('xlsx'),
  })
  .strict();

const gstFilingBodySchema = z
  .object({
    period: gstPeriodSchema,
  })
  .strict();

const gstStatusBodySchema = z
  .object({
    status: z.enum(['generated', 'reported']),
  })
  .strict();

/* ------------------------------------------------------------------------ *
 * WhatsApp template payloads (mirrors Meta's message_templates request).
 * Kept loose on the inner Mongoose-shaped pieces (variables / samples) since
 * Meta lets ops define arbitrary placeholder maps.
 * ------------------------------------------------------------------------ */

const wa_buttonSchema = z
  .object({
    type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
    text: z.string().trim().min(1).max(25),
    /** UI sends `""` for unused fields; treat as absent so url() / min() do not run. */
    url: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.string().trim().url().max(2000).optional()
    ),
    phone: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.string().trim().min(3).max(32).optional()
    ),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.type === 'URL' && !val.url) {
      ctx.addIssue({ code: 'custom', message: 'URL button requires url', path: ['url'] });
    }
    if (val.type === 'PHONE_NUMBER' && !val.phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'PHONE_NUMBER button requires phone',
        path: ['phone'],
      });
    }
  });

const wa_componentSchema = z
  .object({
    header: z
      .object({
        format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).nullable().optional(),
        text: z.string().trim().max(60).optional().nullable(),
        mediaSampleUrl: z.string().trim().url().max(2000).optional().nullable(),
        examples: z.array(z.string()).max(10).optional(),
      })
      .strict()
      .nullable()
      .optional(),
    body: z
      .object({
        text: z.string().trim().min(1).max(1024),
        examples: z.array(z.array(z.string()).max(10)).max(10).optional(),
      })
      .strict()
      .optional()
      .nullable(),
    footer: z
      .object({ text: z.string().trim().max(60) })
      .strict()
      .nullable()
      .optional(),
    buttons: z.array(wa_buttonSchema).max(10).optional(),
  })
  .strict();

const whatsappTemplateBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .regex(/^[a-z0-9_]+$/, 'name must be lowercase snake_case (a-z, 0-9, _)'),
    language: z.string().trim().min(2).max(16).optional(),
    category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
    components: wa_componentSchema.optional(),
    /**
     * Zod v4 requires `z.record(keySchema, valueSchema)`. Variables and
     * samples are loose maps of arbitrary placeholder labels → arbitrary
     * sample values (string, object, or array), so we keep both sides open.
     */
    variables: z.record(z.string(), z.any()).optional(),
    samples: z.record(z.string(), z.any()).optional(),
  })
  .strict();

const whatsappTemplateUpdateBodySchema = whatsappTemplateBodySchema.partial();

const whatsappTemplateListQuerySchema = z
  .object({
    status: z.string().optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    skip: z.coerce.number().int().min(0).optional(),
  })
  .strict();

/** Marketing site “Book demo” form → admin platform lead */
const publicDemoLeadSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(10).max(20),
    email: emailSchema,
    salon: z.string().trim().min(2).max(200),
    city: z.string().trim().min(2).max(120),
    branches: z.string().trim().max(32).optional(),
    preferredTime: z.string().trim().max(80).optional(),
    message: z.string().trim().min(10).max(4000),
    /** Honeypot — must be empty; non-empty still validates but is ignored server-side */
    website: z.string().max(200).optional(),
  })
  .strict();

module.exports = {
  tenantLoginSchema,
  staffLoginSchema,
  adminLoginSchema,
  adminSettingsCategorySchema,
  adminSettingsCategoryParamSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  objectIdHex,
  mongoIdParamSchema,
  bookingIdParamSchema,
  createClientBodySchema,
  updateClientBodySchema,
  createStaffBodySchema,
  staffUpdateBodySchema,
  staffChangePasswordBodySchema,
  salePaymentBodySchema,
  saleExchangeBodySchema,
  createUserBodySchema,
  updateUserBodySchema,
  userChangePasswordBodySchema,
  verifyAdminPasswordBodySchema,
  createExpenseBodySchema,
  updateExpenseBodySchema,
  bookingSlotHoldBodySchema,
  bookingCreateBodySchema,
  packageCreateBodySchema,
  roleIdParamSchema,
  adminUserIdParamSchema,
  adminRoleCreateBodySchema,
  adminRoleUpdateBodySchema,
  gstInvoicesQuerySchema,
  gstSummaryQuerySchema,
  gstExportBodySchema,
  gstFilingBodySchema,
  gstStatusBodySchema,
  whatsappTemplateBodySchema,
  whatsappTemplateUpdateBodySchema,
  whatsappTemplateListQuerySchema,
  publicDemoLeadSchema,
};
