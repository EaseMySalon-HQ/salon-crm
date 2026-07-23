'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { apiClient } from '@/lib/api'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { slugifyFieldKey } from '@/lib/website-enquiry-fields'

export type EnquiryCustomField = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date' | 'select'
  required: boolean
  placeholder: string
  options: string[]
  order: number
}

type WebsiteEnquiryRow = {
  id: string
  type: string
  typeLabel: string
  name: string
  phone: string
  email: string
  city: string
  message: string
  customFields: Record<string, string>
  related: { kind: string; id: string; name: string } | null
  requestedProducts?: { productId: string; productName: string; quantity: number }[]
  fulfillmentType?: 'delivery' | 'pickup' | ''
  deliveryAddress?: string
  preferredPickupSlot?: string
  leadId: string | null
  status: 'new' | 'contacted' | 'converted' | 'closed'
  createdAt: string
}

const FIELD_TYPES: EnquiryCustomField['type'][] = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'date',
  'select',
]

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'closed', label: 'Closed' },
] as const

function emptyField(order: number): EnquiryCustomField {
  return {
    key: '',
    label: '',
    type: 'text',
    required: false,
    placeholder: '',
    options: [],
    order,
  }
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function WebsiteEnquiriesTab({
  customFields,
  onCustomFieldsChange,
  onSaveFormFields,
  savingFormFields,
}: {
  customFields: EnquiryCustomField[]
  onCustomFieldsChange: (fields: EnquiryCustomField[]) => void
  onSaveFormFields: () => Promise<void>
  savingFormFields: boolean
}) {
  const [enquiries, setEnquiries] = useState<WebsiteEnquiryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const fieldLabels = useMemo(
    () => new Map(customFields.map((field) => [field.key, field.label])),
    [customFields]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q =
        statusFilter === 'all' ? '' : `?status=${encodeURIComponent(statusFilter)}&limit=50`
      const res = await apiClient.get(`/settings/website/enquiries${q}`)
      setEnquiries(res.data?.data?.enquiries || [])
      setTotal(res.data?.data?.total || 0)
    } catch {
      setEnquiries([])
      setTotal(0)
      toast({ title: 'Could not load enquiries', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  async function updateStatus(id: string, status: WebsiteEnquiryRow['status']) {
    setUpdatingId(id)
    try {
      const res = await apiClient.patch(`/settings/website/enquiries/${id}`, { status })
      const updated = res.data?.data
      if (updated) {
        setEnquiries((prev) => prev.map((row) => (row.id === id ? updated : row)))
      }
    } catch (e: unknown) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  function patchField(index: number, patch: Partial<EnquiryCustomField>) {
    const next = customFields.map((field, i) => {
      if (i !== index) return field
      const merged = { ...field, ...patch }
      if (patch.label != null && (!field.key || field.key.startsWith('field_'))) {
        merged.key = slugifyFieldKey(patch.label, `field_${index + 1}`)
      }
      if (patch.type && patch.type !== 'select') {
        merged.options = []
      }
      return merged
    })
    onCustomFieldsChange(next)
  }

  function addField() {
    if (customFields.length >= 10) return
    onCustomFieldsChange([...customFields, emptyField(customFields.length)])
  }

  function removeField(index: number) {
    onCustomFieldsChange(customFields.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h3 className="font-medium">Website enquiries</h3>
          <p className="mt-1 text-sm text-slate-600">
            Submissions from your mini-site contact form, product cart requests, and other enquiry
            forms. A matching lead is also created under Leads when someone submits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-sm text-slate-600">Filter</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-500">{total} total</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading enquiries…
          </div>
        ) : !enquiries.length ? (
          <p className="py-6 text-sm text-slate-500">No enquiries yet.</p>
        ) : (
          <div className="divide-y rounded-lg border border-slate-100">
            {enquiries.map((row) => (
              <div key={row.id} className="space-y-2 px-4 py-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-500">
                      {row.typeLabel} · {formatWhen(row.createdAt)}
                    </p>
                  </div>
                  <Select
                    value={row.status}
                    disabled={updatingId === row.id}
                    onValueChange={(v) =>
                      void updateStatus(row.id, v as WebsiteEnquiryRow['status'])
                    }
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1 text-slate-700">
                  <p>
                    <span className="text-slate-500">Phone:</span> {row.phone}
                  </p>
                  {row.email ? (
                    <p>
                      <span className="text-slate-500">Email:</span> {row.email}
                    </p>
                  ) : null}
                  {row.city ? (
                    <p>
                      <span className="text-slate-500">City:</span> {row.city}
                    </p>
                  ) : null}
                  {row.related?.name ? (
                    <p>
                      <span className="text-slate-500">Related:</span> {row.related.name}
                    </p>
                  ) : null}
                  {row.requestedProducts?.length ? (
                    <div>
                      <p className="text-slate-500">Requested products:</p>
                      <ul className="mt-1 list-inside list-disc text-slate-700">
                        {row.requestedProducts.map((item) => (
                          <li key={`${item.productId}-${item.productName}`}>
                            {item.productName}
                            {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {row.fulfillmentType ? (
                    <p>
                      <span className="text-slate-500">Fulfillment:</span>{' '}
                      {row.fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup'}
                    </p>
                  ) : null}
                  {row.deliveryAddress ? (
                    <p className="whitespace-pre-wrap">
                      <span className="text-slate-500">Delivery address:</span> {row.deliveryAddress}
                    </p>
                  ) : null}
                  {row.preferredPickupSlot ? (
                    <p>
                      <span className="text-slate-500">Preferred pickup slot:</span>{' '}
                      {row.preferredPickupSlot}
                    </p>
                  ) : null}
                  {row.message ? (
                    <p className="whitespace-pre-wrap">
                      <span className="text-slate-500">Message:</span> {row.message}
                    </p>
                  ) : null}
                  {Object.entries(row.customFields || {}).map(([key, value]) => (
                    <p key={key}>
                      <span className="text-slate-500">{fieldLabels.get(key) || key}:</span> {value}
                    </p>
                  ))}
                </div>
                {row.leadId ? (
                  <p className="text-xs text-slate-500">
                    Also saved as a lead — view under Leads in your CRM.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h3 className="font-medium">Custom enquiry fields</h3>
          <p className="mt-1 text-sm text-slate-600">
            Add extra questions to your public enquiry form (contact page, package/product enquiries,
            etc.). Name, phone, email, and message are always included.
          </p>
        </div>

        <div className="space-y-4">
          {customFields.map((field, index) => (
            <div
              key={`${field.key || 'field'}-${index}`}
              className="space-y-3 rounded-lg border border-slate-100 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Field {index + 1}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeField(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Label</Label>
                  <Input
                    className="mt-1"
                    value={field.label}
                    onChange={(e) => patchField(index, { label: e.target.value })}
                    placeholder="e.g. Preferred appointment date"
                  />
                </div>
                <div>
                  <Label>Field type</Label>
                  <Select
                    value={field.type}
                    onValueChange={(v) =>
                      patchField(index, { type: v as EnquiryCustomField['type'] })
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Placeholder (optional)</Label>
                  <Input
                    className="mt-1"
                    value={field.placeholder}
                    onChange={(e) => patchField(index, { placeholder: e.target.value })}
                  />
                </div>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 text-sm md:mt-6">
                  <span>Required</span>
                  <Switch
                    checked={field.required}
                    onCheckedChange={(v) => patchField(index, { required: v })}
                  />
                </label>
              </div>
              {field.type === 'select' ? (
                <div>
                  <Label>Options (one per line)</Label>
                  <Textarea
                    className="mt-1"
                    rows={3}
                    value={field.options.join('\n')}
                    onChange={(e) =>
                      patchField(index, {
                        options: e.target.value
                          .split('\n')
                          .map((line) => line.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder={'Option A\nOption B'}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addField} disabled={customFields.length >= 10}>
            <Plus className="mr-2 h-4 w-4" />
            Add field
          </Button>
          <Button type="button" size="sm" disabled={savingFormFields} onClick={() => void onSaveFormFields()}>
            {savingFormFields ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              'Save form fields'
            )}
          </Button>
        </div>
      </section>
    </div>
  )
}
