'use client'

import { useMemo, useState } from 'react'
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  formatInr,
  submitSiteProductRequest,
  type ProductFulfillmentType,
  type SiteEnquiryCustomField,
  type SiteProfile,
} from '@/lib/public-site-api'
import {
  PRODUCT_QUANTITY_LIMIT_MESSAGE,
  useProductCart,
} from '@/components/mini-site/product-cart-context'
import { useSiteTrack } from '@/components/mini-site/mini-site-shell'
import { buildPickupSlotOptions } from '@/lib/mini-site-pickup-slots'
import { ST } from '@/lib/mini-site-theme'
import { cn } from '@/lib/utils'

export function ProductCartSheet({
  slug,
  open,
  onOpenChange,
  customFields = [],
  operatingHours,
}: {
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  customFields?: SiteEnquiryCustomField[]
  operatingHours?: SiteProfile['operatingHours']
}) {
  const { lines, itemCount, setQuantity, removeProduct, clearCart } = useProductCart()
  const { track } = useSiteTrack(slug)
  const [fulfillmentType, setFulfillmentType] = useState<ProductFulfillmentType>('pickup')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [preferredPickupSlot, setPreferredPickupSlot] = useState('')
  const [message, setMessage] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const sortedCustomFields = useMemo(
    () => [...customFields].sort((a, b) => (a.key > b.key ? 1 : -1)),
    [customFields]
  )

  const pickupSlots = useMemo(
    () => buildPickupSlotOptions(operatingHours, { daysAhead: 7, intervalMinutes: 120 }),
    [operatingHours]
  )

  const estimatedTotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        if (line.price == null) return sum
        return sum + line.price * line.quantity
      }, 0),
    [lines]
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!lines.length) return
    setStatus('loading')
    setError('')
    try {
      await submitSiteProductRequest(slug, {
        fulfillmentType,
        name,
        phone,
        email,
        deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress : undefined,
        preferredPickupSlot: fulfillmentType === 'pickup' ? preferredPickupSlot : undefined,
        message,
        items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        customFields: sortedCustomFields.length
          ? Object.fromEntries(sortedCustomFields.map((f) => [f.key, customValues[f.key] || '']))
          : undefined,
        website: honeypot,
      })
      track('lead_submission', 'product_request')
      setStatus('done')
      clearCart()
      setFulfillmentType('pickup')
      setName('')
      setPhone('')
      setEmail('')
      setDeliveryAddress('')
      setPreferredPickupSlot('')
      setMessage('')
      setCustomValues({})
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not submit request')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col bg-[color:var(--site-surface)] sm:max-w-md">
        <SheetHeader>
          <SheetTitle className={ST.textPrimary}>Your product request</SheetTitle>
          <SheetDescription className={ST.textMuted}>
            Add products you want to buy. We&apos;ll notify the salon with your contact details —
            they&apos;ll follow up about delivery or pickup.
          </SheetDescription>
        </SheetHeader>

        {status === 'done' ? (
          <div className="mt-6 space-y-3">
            <p className={cn('text-sm font-medium', ST.textPrimary)}>Request sent successfully.</p>
            <p className={cn('text-sm', ST.textMuted)}>
              The salon has been notified and will contact you soon.
            </p>
            <Button type="button" className={ST.btnPrimary} onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
            {lines.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                <ShoppingBag className={cn('h-10 w-10 opacity-40', ST.textMuted)} />
                <p className={cn('mt-3 text-sm', ST.textMuted)}>Your cart is empty.</p>
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {lines.map((line) => (
                    <li
                      key={line.productId}
                      className={cn('rounded-xl border p-3', ST.card)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={cn('font-medium', ST.textPrimary)}>{line.name}</p>
                          {line.price != null ? (
                            <p className={cn('mt-0.5 text-sm', ST.textMuted)}>
                              {formatInr(line.price)}
                              {line.quantity > 1 ? ` × ${line.quantity}` : ''}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProduct(line.productId)}
                          className={cn('rounded p-1', ST.textMuted, 'hover:text-red-600')}
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded border border-[color:var(--site-border)] p-1"
                          onClick={() => setQuantity(line.productId, line.quantity - 1)}
                          disabled={line.quantity <= 1}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className={cn('min-w-[1.5rem] text-center text-sm', ST.textPrimary)}>
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          className="rounded border border-[color:var(--site-border)] p-1 disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => setQuantity(line.productId, line.quantity + 1)}
                          disabled={line.quantity >= line.maxQuantity}
                          aria-label={
                            line.quantity >= line.maxQuantity
                              ? 'Maximum available quantity reached'
                              : 'Increase quantity'
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {line.quantity >= line.maxQuantity ? (
                        <p className={cn('mt-2 text-xs leading-snug', ST.textMuted)}>
                          {PRODUCT_QUANTITY_LIMIT_MESSAGE}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {estimatedTotal > 0 ? (
                  <p className={cn('text-sm font-medium', ST.textPrimary)}>
                    Estimated total: {formatInr(estimatedTotal)}
                  </p>
                ) : null}

                <form onSubmit={onSubmit} className="space-y-3 border-t pt-4">
                  <p className={cn('text-sm font-medium', ST.textPrimary)}>Your details</p>
                  <fieldset>
                    <legend className={cn('text-sm', ST.textMuted)}>How would you like to receive your order?</legend>
                    <div className="mt-2 flex flex-wrap gap-4">
                      {(
                        [
                          { value: 'pickup', label: 'Pickup' },
                          { value: 'delivery', label: 'Delivery' },
                        ] as const
                      ).map((option) => (
                        <label
                          key={option.value}
                          className={cn(
                            'inline-flex cursor-pointer items-center gap-2 text-sm',
                            ST.textPrimary
                          )}
                        >
                          <input
                            type="radio"
                            name="fulfillment-type"
                            value={option.value}
                            checked={fulfillmentType === option.value}
                            onChange={() => {
                              setFulfillmentType(option.value)
                              if (option.value === 'delivery') {
                                setPreferredPickupSlot('')
                              }
                            }}
                            className="h-4 w-4 accent-[var(--site-accent)]"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div>
                    <Label htmlFor="cart-name">Name *</Label>
                    <Input
                      id="cart-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={ST.input}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cart-phone">Phone *</Label>
                    <Input
                      id="cart-phone"
                      required
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={ST.input}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cart-email">
                      Email{fulfillmentType === 'delivery' ? ' *' : ' (optional)'}
                    </Label>
                    <Input
                      id="cart-email"
                      type="email"
                      required={fulfillmentType === 'delivery'}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={ST.input}
                    />
                  </div>
                  {fulfillmentType === 'delivery' ? (
                    <div>
                      <Label htmlFor="cart-delivery-address">Delivery address *</Label>
                      <Textarea
                        id="cart-delivery-address"
                        required
                        rows={3}
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Full address with pincode and landmarks"
                        className={ST.input}
                      />
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="cart-pickup-slot">Preferred pickup slot</Label>
                      {pickupSlots.length ? (
                        <select
                          id="cart-pickup-slot"
                          value={preferredPickupSlot}
                          onChange={(e) => setPreferredPickupSlot(e.target.value)}
                          className={cn(
                            'mt-1 flex h-10 w-full rounded-md border border-[color:var(--site-border)] bg-[color:var(--site-surface)] px-3 py-2 text-sm text-[color:var(--site-text-primary)]',
                            ST.input
                          )}
                        >
                          <option value="">Select a time slot (optional)</option>
                          {pickupSlots.map((slot) => (
                            <option key={slot.value} value={slot.value}>
                              {slot.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className={cn('mt-1 text-sm', ST.textMuted)}>
                          No pickup slots are available right now based on opening hours. You can still
                          submit your request and the salon will contact you.
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <Label htmlFor="cart-message">Message (optional)</Label>
                    <Textarea
                      id="cart-message"
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Any additional notes for the salon"
                      className={ST.input}
                    />
                  </div>
                  {sortedCustomFields.map((field) => (
                    <div key={field.key}>
                      <Label htmlFor={`cart-custom-${field.key}`}>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </Label>
                      {field.type === 'textarea' ? (
                        <Textarea
                          id={`cart-custom-${field.key}`}
                          required={field.required}
                          value={customValues[field.key] || ''}
                          onChange={(e) =>
                            setCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className={ST.input}
                        />
                      ) : (
                        <Input
                          id={`cart-custom-${field.key}`}
                          required={field.required}
                          value={customValues[field.key] || ''}
                          onChange={(e) =>
                            setCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className={ST.input}
                        />
                      )}
                    </div>
                  ))}
                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    className="hidden"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden
                  />
                  {error ? <p className="text-sm text-red-600">{error}</p> : null}
                  <Button
                    type="submit"
                    className={cn('w-full', ST.btnPrimary)}
                    disabled={status === 'loading' || itemCount === 0}
                  >
                    {status === 'loading' ? 'Sending…' : 'Submit request'}
                  </Button>
                </form>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function ProductCartTrigger({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  const { itemCount } = useProductCart()
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
        ST.btnSecondary,
        className
      )}
      aria-label={`Open product cart${itemCount ? `, ${itemCount} items` : ''}`}
    >
      <ShoppingBag className="h-4 w-4" />
      <span>Cart</span>
      {itemCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--site-accent)] px-1 text-xs font-semibold text-white">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      ) : null}
    </button>
  )
}
