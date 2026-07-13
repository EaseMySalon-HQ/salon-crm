/** Active expense categories shown in forms and report filters. */
export const EXPENSE_CATEGORIES = [
  "Supplies",
  "Marketing",
  "Rent",
  "Maintenance",
  "Travel",
  "Other",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
