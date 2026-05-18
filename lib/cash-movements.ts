export type CashMovementType =
  | 'owner_withdrawal'
  | 'bank_deposit'
  | 'safe_transfer'
  | 'petty_cash_transfer'
  | 'cash_added'
  | 'other'

export type CashMovementDirection = 'in' | 'out'

export const CASH_MOVEMENT_TYPE_OPTIONS: Array<{
  value: CashMovementType
  label: string
  direction: CashMovementDirection
  description?: string
}> = [
  { value: 'owner_withdrawal', label: 'Owner withdrawal', direction: 'out', description: 'Cash taken by owner — not an expense' },
  { value: 'bank_deposit', label: 'Bank deposit', direction: 'out', description: 'Cash sent to bank' },
  { value: 'safe_transfer', label: 'Safe transfer', direction: 'out', description: 'Moved to office safe' },
  { value: 'petty_cash_transfer', label: 'To petty cash', direction: 'out', description: 'Leaves the drawer and adds the same amount to Petty Cash balance (Expenses page)' },
  { value: 'cash_added', label: 'Cash added to drawer', direction: 'in', description: 'Float or cash put into the drawer' },
  { value: 'other', label: 'Other', direction: 'out', description: 'Choose direction below' },
]

export function labelForCashMovementType(type: string): string {
  return CASH_MOVEMENT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

export function defaultDirectionForType(type: CashMovementType): CashMovementDirection {
  const opt = CASH_MOVEMENT_TYPE_OPTIONS.find((o) => o.value === type)
  return opt?.direction ?? 'out'
}

export interface CashMovementRow {
  _id: string
  type: string
  direction: CashMovementDirection
  amount: number
  date: string
  reason?: string
  referenceNo?: string
  createdBy?: string
  status?: string
  voidedAt?: string
  voidedBy?: string
}

export function computeExpectedCashBalance(opts: {
  opening: number
  cashCollected: number
  expense: number
  cashIn: number
  cashOut: number
}): number {
  const { opening, cashCollected, expense, cashIn, cashOut } = opts
  return opening + cashCollected - expense + cashIn - cashOut
}
