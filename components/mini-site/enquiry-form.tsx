'use client'

import { useMemo, useState } from 'react'
import { submitSiteEnquiry, type SiteEnquiryCustomField } from '@/lib/public-site-api'
import { useSiteTrack } from '@/components/mini-site/mini-site-shell'
import { ST } from '@/lib/mini-site-theme'
import { cn } from '@/lib/utils'

export function EnquiryForm({
  slug,
  type = 'general',
  relatedId,
  relatedField,
  customFields = [],
}: {
  slug: string
  type?: 'bridal' | 'package' | 'membership' | 'product' | 'general'
  relatedId?: string
  relatedField?: 'relatedServiceId' | 'relatedPackageId' | 'relatedProductId' | 'relatedMembershipId'
  customFields?: SiteEnquiryCustomField[]
}) {
  const { track } = useSiteTrack(slug)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const sortedCustomFields = useMemo(
    () => [...customFields].sort((a, b) => (a.key > b.key ? 1 : -1)),
    [customFields]
  )

  function setCustomValue(key: string, value: string) {
    setCustomValues((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')
    try {
      const body: Parameters<typeof submitSiteEnquiry>[1] = {
        type,
        name,
        phone,
        email,
        message,
        website: honeypot,
      }
      if (relatedId && relatedField) body[relatedField] = relatedId
      if (sortedCustomFields.length) {
        body.customFields = Object.fromEntries(
          sortedCustomFields.map((field) => [field.key, customValues[field.key] || ''])
        )
      }
      await submitSiteEnquiry(slug, body)
      track('lead_submission', type)
      if (type === 'package') track('package_enquiry', relatedId)
      if (type === 'membership') track('membership_enquiry', relatedId)
      if (type === 'product') track('product_enquiry', relatedId)
      setStatus('done')
      setName('')
      setPhone('')
      setEmail('')
      setMessage('')
      setCustomValues({})
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not submit')
    }
  }

  function renderCustomField(field: SiteEnquiryCustomField) {
    const value = customValues[field.key] || ''
    const commonClass = ST.input
    if (field.type === 'textarea') {
      return (
        <textarea
          required={field.required}
          value={value}
          onChange={(e) => setCustomValue(field.key, e.target.value)}
          rows={3}
          placeholder={field.placeholder}
          className={commonClass}
        />
      )
    }
    if (field.type === 'select') {
      return (
        <select
          required={field.required}
          value={value}
          onChange={(e) => setCustomValue(field.key, e.target.value)}
          className={commonClass}
        >
          <option value="">{field.placeholder || 'Select…'}</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )
    }
    return (
      <input
        required={field.required}
        type={
          field.type === 'email'
            ? 'email'
            : field.type === 'phone'
              ? 'tel'
              : field.type === 'number'
                ? 'number'
                : field.type === 'date'
                  ? 'date'
                  : 'text'
        }
        value={value}
        onChange={(e) => setCustomValue(field.key, e.target.value)}
        placeholder={field.placeholder}
        className={commonClass}
      />
    )
  }

  if (status === 'done') {
    return (
      <div className={ST.successBox}>
        Thanks — we received your enquiry and will get back to you soon.
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className={cn('space-y-4 p-6', ST.card)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className={cn('mb-1 block', ST.textMuted)}>Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={ST.input}
          />
        </label>
        <label className="block text-sm">
          <span className={cn('mb-1 block', ST.textMuted)}>Phone</span>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={ST.input}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className={cn('mb-1 block', ST.textMuted)}>Email (optional)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={ST.input}
        />
      </label>
      {sortedCustomFields.map((field) => (
        <label key={field.key} className="block text-sm">
          <span className={cn('mb-1 block', ST.textMuted)}>
            {field.label}
            {field.required ? '' : ' (optional)'}
          </span>
          {renderCustomField(field)}
        </label>
      ))}
      <label className="block text-sm">
        <span className={cn('mb-1 block', ST.textMuted)}>Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className={ST.input}
        />
      </label>
      <input
        tabIndex={-1}
        autoComplete="off"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="hidden"
        aria-hidden
      />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <button
        type="submit"
        disabled={status === 'loading'}
        className={ST.btnPrimary}
      >
        {status === 'loading' ? 'Sending…' : 'Send enquiry'}
      </button>
    </form>
  )
}
