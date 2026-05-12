"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import axios from "axios"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

type PublicContext = {
  businessName: string
  billNo: string
  visitDate: string
  items: { name: string; type: string }[]
  alreadySubmitted: boolean
  allowResubmission: boolean
  submittedRating: number | null
}

export default function PublicFeedbackPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const businessId = params.businessId as string
  const token = params.token as string

  const [ctx, setCtx] = useState<PublicContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<null | {
    kind: "google" | "internal"
    googleReviewUrl?: string | null
    copyHint?: boolean
    googleConfigured?: boolean
  }>(null)

  const sourceParam = useMemo(() => searchParams.get("s") || undefined, [searchParams])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!businessId || !token) {
        setError("Invalid link")
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await axios.get(`${API_BASE}/public/feedback/${businessId}/${token}`, {
          headers: { "Content-Type": "application/json" },
          timeout: 15000,
        })
        if (cancelled) return
        if (!res.data?.success) {
          setError(res.data?.error || "Could not load feedback")
          setLoading(false)
          return
        }
        const d = res.data.data as PublicContext
        setCtx(d)
        if (d.alreadySubmitted && d.submittedRating != null) {
          setRating(d.submittedRating)
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.response?.data?.error || "Something went wrong")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [businessId, token])

  const submit = async () => {
    if (!businessId || !token || rating < 1) return
    setSubmitting(true)
    setError(null)
    try {
      const qs = sourceParam ? `?s=${encodeURIComponent(sourceParam)}` : ""
      const res = await axios.post(
        `${API_BASE}/public/feedback/${businessId}/${token}/submit${qs}`,
        {
          rating,
          reviewText: reviewText.trim() || undefined,
          source: sourceParam,
        },
        { headers: { "Content-Type": "application/json" }, timeout: 20000 }
      )
      if (!res.data?.success) {
        setError(res.data?.error || "Could not submit")
        return
      }
      const payload = res.data.data
      if (payload.thankYouType === "google") {
        setDone({
          kind: "google",
          googleReviewUrl: payload.googleReviewUrl,
          copyHint: payload.copyHint,
          googleConfigured: payload.googleConfigured,
        })
      } else {
        setDone({ kind: "internal" })
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error || "Could not submit feedback"
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
        <p className="text-sm text-slate-600">Loading…</p>
      </div>
    )
  }

  if (error && !ctx) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
        <Card className="w-full max-w-md border-slate-200 shadow-sm">
          <CardContent className="pt-8 pb-6 text-center text-sm text-slate-700">{error}</CardContent>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
        <Card className="w-full max-w-md border-slate-200 shadow-md">
          <CardHeader className="text-center space-y-2 pb-2">
            <CardTitle className="text-xl font-semibold tracking-tight text-slate-900">
              {done.kind === "google" ? "Thank you!" : "Thank you"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center text-sm text-slate-600">
            {done.kind === "google" ? (
              <>
                <p>
                  We&apos;re glad you had a great experience at{" "}
                  <span className="font-medium text-slate-800">{ctx?.businessName}</span>.
                </p>
                {done.googleReviewUrl ? (
                  <>
                    <Button
                      asChild
                      className="w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                    >
                      <a href={done.googleReviewUrl} target="_blank" rel="noopener noreferrer">
                        Post on Google Review
                      </a>
                    </Button>
                    {done.copyHint && reviewText.trim() ? (
                      <p className="text-xs text-slate-500 leading-relaxed">
                        You can copy the review you wrote earlier and paste it on Google.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Google Review link is not configured.
                  </p>
                )}
              </>
            ) : (
              <p className="leading-relaxed">
                Thank you for your feedback. The salon team will review this and work on improving
                your experience.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const blocked = ctx?.alreadySubmitted && !ctx?.allowResubmission

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-8 pb-12">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Feedback</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {ctx?.businessName}
          </h1>
          <p className="text-sm text-slate-500">
            Invoice <span className="font-medium text-slate-700">{ctx?.billNo}</span>
          </p>
        </div>

        {ctx?.items?.length ? (
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-800">Your visit</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                {ctx.items.slice(0, 8).map((it, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-slate-100 pb-2 last:border-0">
                    <span className="truncate">{it.name}</span>
                    <span className="shrink-0 text-xs text-slate-400 capitalize">{it.type}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {blocked ? (
          <Card className="border-slate-200">
            <CardContent className="pt-6 text-center text-sm text-slate-600">
              You&apos;ve already shared feedback for this visit. Thank you!
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-slate-900">How was your experience?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="p-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    aria-label={`${n} stars`}
                  >
                    <Star
                      className={cn(
                        "h-10 w-10 sm:h-11 sm:w-11 transition-colors",
                        n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-200"
                      )}
                      strokeWidth={1.25}
                    />
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">Comment (optional)</label>
                <Textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Tell us what stood out…"
                  className="min-h-[100px] resize-none border-slate-200 text-sm"
                  maxLength={2000}
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button
                className="w-full rounded-xl h-11 text-base font-medium"
                disabled={rating < 1 || submitting}
                onClick={submit}
              >
                {submitting ? "Submitting…" : "Submit feedback"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
