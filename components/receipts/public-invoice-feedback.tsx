"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SalesAPI } from "@/lib/api"
import { Loader2, Sparkles, Star } from "lucide-react"
import { cn } from "@/lib/utils"

export type FeedbackEligibility = {
  completed: boolean
  canSubmit: boolean
  alreadySubmitted: boolean
  allowResubmission: boolean
  submittedRating: number | null
}

type Props = {
  billNo: string
  shareToken: string
  eligibility: FeedbackEligibility | null
  businessName?: string
  /** Receipt preview block; rendered below the action toolbar. */
  receipt: ReactNode
  /** Placed after the rate CTA in the top toolbar (e.g. Download PDF). */
  trailingActions?: ReactNode
  /** After successful feedback submit — re-fetch public receipt / eligibility (e.g. toolbar state). */
  onFeedbackSubmitted?: () => void | Promise<void>
}

export function PublicInvoiceFeedbackSection({
  billNo,
  shareToken,
  eligibility,
  businessName,
  receipt,
  trailingActions,
  onFeedbackSubmitted,
}: Props) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [generatingSuggestion, setGeneratingSuggestion] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Session-only: after successful submit, thank-you shows in the same dialog. */
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [thankYou, setThankYou] = useState<{
    kind: "google" | "internal"
    googleReviewUrl?: string | null
    googleConfigured?: boolean
  } | null>(null)
  /** Snapshot of comment body at submit (used when opening Google). */
  const [lastSubmittedReviewText, setLastSubmittedReviewText] = useState("")
  const [submittedHadText, setSubmittedHadText] = useState(false)

  const showPendingThankYou =
    !justSubmitted &&
    eligibility &&
    eligibility.completed &&
    eligibility.alreadySubmitted &&
    !eligibility.allowResubmission

  const showCTA =
    !justSubmitted &&
    eligibility?.canSubmit === true &&
    eligibility.completed &&
    !showPendingThankYou

  const openModal = () => {
    setError(null)
    setThankYou(null)
    setJustSubmitted(false)
    setRating(0)
    setReviewText("")
    setGeneratingSuggestion(false)
    setLastSubmittedReviewText("")
    setOpen(true)
  }

  const closeDialog = () => {
    setOpen(false)
    setJustSubmitted(false)
    setThankYou(null)
    setGeneratingSuggestion(false)
    setLastSubmittedReviewText("")
  }

  const copySubmittedCommentAndOpenGoogleReview = async (url: string) => {
    const t = lastSubmittedReviewText.trim()
    if (t.length > 0) {
      try {
        if (typeof navigator.clipboard?.writeText === "function") {
          await navigator.clipboard.writeText(t)
        } else {
          const ta = document.createElement("textarea")
          ta.value = t
          ta.setAttribute("readonly", "")
          ta.style.position = "fixed"
          ta.style.left = "-9999px"
          ta.style.opacity = "0"
          document.body.appendChild(ta)
          ta.select()
          document.execCommand("copy")
          document.body.removeChild(ta)
        }
      } catch {
        /* still navigate */
      }
    }

    window.location.assign(url)
  }

  const generateWithAi = async () => {
    if (rating !== 5 || generatingSuggestion) return
    setGeneratingSuggestion(true)
    setError(null)
    try {
      const res = await SalesAPI.suggestInvoiceFeedbackPublic(billNo, shareToken, { rating })
      if (!res.success) {
        setError(res.error || "Could not generate a suggestion")
        return
      }
      const text = (res.data as { text?: string } | undefined)?.text
      if (text?.trim()) {
        setReviewText(text.trim())
      } else {
        setError("No suggestion returned. Try again.")
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || "Could not generate a suggestion")
    } finally {
      setGeneratingSuggestion(false)
    }
  }

  const submit = async () => {
    if (rating < 1) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await SalesAPI.submitInvoiceFeedbackPublic(billNo, shareToken, {
        rating,
        reviewText: reviewText.trim() || undefined,
      })
      if (!res.success) {
        setError(res.error || "Could not submit feedback")
        return
      }
      const d = res.data as any
      const submittedComment = reviewText.trim()
      setLastSubmittedReviewText(submittedComment)
      setSubmittedHadText(submittedComment.length > 0)
      setJustSubmitted(true)
      setOpen(true)
      if (d?.thankYouType === "google") {
        setThankYou({
          kind: "google",
          googleReviewUrl: d.googleReviewUrl,
          googleConfigured: d.googleConfigured,
        })
      } else {
        setThankYou({ kind: "internal" })
      }
      await onFeedbackSubmitted?.()
    } catch (e: any) {
      setError(e?.response?.data?.error || "Could not submit feedback")
    } finally {
      setSubmitting(false)
    }
  }

  const completed = eligibility?.completed === true

  /** Prior visit: feedback already saved; compact note only (no Google URL without extra API). */
  const pendingToolbarNote = showPendingThankYou ? (
    <p
      className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-4 py-2.5 text-sm text-indigo-950 no-print"
      role="status"
    >
      <span className="font-semibold">Feedback submitted. Thank you!</span>
    </p>
  ) : null

  /** Primary actions + Download: one row on mobile (two equal columns). */
  const dualColumnToolbar =
    !!trailingActions && (showCTA || pendingToolbarNote)

  const toolbar =
    showCTA || pendingToolbarNote ? (
      <div
        className={cn(
          "mb-4 gap-2 items-stretch no-print w-full max-w-full",
          dualColumnToolbar ? "grid grid-cols-2" : "flex flex-wrap justify-end items-start"
        )}
      >
        {showCTA ? (
          <Button
            type="button"
            onClick={openModal}
            variant="outline"
            className={cn(
              "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100",
              dualColumnToolbar ? "w-full min-w-0 px-2 sm:px-4 text-sm h-auto py-2 whitespace-normal text-center" : "w-full sm:w-auto"
            )}
          >
            Rate Your Experience
          </Button>
        ) : null}
        {pendingToolbarNote && dualColumnToolbar ? (
          <div className="min-w-0 flex items-center">{pendingToolbarNote}</div>
        ) : (
          pendingToolbarNote
        )}
        {dualColumnToolbar && trailingActions ? (
          <div className="min-w-0 flex items-stretch [&>button]:w-full [&>button]:h-full">{trailingActions}</div>
        ) : (
          trailingActions
        )}
      </div>
    ) : trailingActions ? (
      <div className="mb-4 flex flex-wrap justify-end gap-2 items-start no-print">
        {trailingActions}
      </div>
    ) : null

  const showThankYouInDialog = justSubmitted && thankYou != null

  return (
    <>
      {toolbar}
      {receipt}
      {completed ? (
        <>
          <Dialog
            open={open}
            onOpenChange={(next) => {
              if (!next) closeDialog()
              else setOpen(true)
            }}
          >
            <DialogContent className="sm:max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle>
                  {showThankYouInDialog ? "Thank you!" : "Rate Your Experience"}
                </DialogTitle>
                <DialogDescription>
                  {showThankYouInDialog ? (
                    "Your feedback means a lot to us."
                  ) : (
                    <>
                      Your feedback helps
                      {businessName ? ` ${businessName}` : " the salon"} improve.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>

              {showThankYouInDialog ? (
                <div className="space-y-4 py-1 text-sm text-slate-800" role="status">
                  <p className="font-medium text-slate-900">Feedback submitted. Thank you!</p>
                  {thankYou?.kind === "google" && thankYou.googleReviewUrl ? (
                    <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                      <p className="text-slate-600 text-xs">
                        If you&apos;d like, you can also share your experience on Google.
                      </p>
                      <Button
                        type="button"
                        className="w-full rounded-lg"
                        size="sm"
                        onClick={() => copySubmittedCommentAndOpenGoogleReview(thankYou.googleReviewUrl!)}
                      >
                        Post on Google Review
                      </Button>
                      <p className="text-xs text-slate-500">
                        {submittedHadText
                          ? "Your comment will be copied to the clipboard before Google opens—you can paste it into your review."
                          : "Opens Google Reviews on this tab."}
                      </p>
                    </div>
                  ) : null}
                  {thankYou?.kind === "google" &&
                  !thankYou.googleReviewUrl &&
                  thankYou.googleConfigured === false ? (
                    <p className="text-xs text-amber-800">Google Review link is not configured.</p>
                  ) : null}
                  {thankYou?.kind === "internal" ? (
                    <p className="text-slate-600 text-xs leading-relaxed">
                      Thank you for your feedback. The salon team will review this and work on
                      improving your experience.
                    </p>
                  ) : null}
                  <DialogFooter className="px-0 sm:justify-end">
                    <Button type="button" onClick={closeDialog}>
                      Close
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <>
                  <div className="space-y-4 py-2">
                    <div className="flex justify-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRating(n)}
                          className="p-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                          aria-label={`${n} stars`}
                        >
                          <Star
                            className={cn(
                              "h-9 w-9",
                              n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-200"
                            )}
                            strokeWidth={1.2}
                          />
                        </button>
                      ))}
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-slate-600" htmlFor="invoice-feedback-comment">
                          Comment (optional)
                        </label>
                        {rating === 5 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 shrink-0 gap-1 px-2 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                            disabled={generatingSuggestion}
                            onClick={generateWithAi}
                            title="Draft a Maps-style thank-you comment (past visits may be referenced when we know them)"
                          >
                            {generatingSuggestion ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" aria-hidden />
                            )}
                            Generate with AI
                          </Button>
                        ) : (
                          <span className="h-8 shrink-0" aria-hidden />
                        )}
                      </div>
                      <Textarea
                        id="invoice-feedback-comment"
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        className="mt-1 min-h-[88px] text-sm"
                        placeholder="Tell us what went well or what we can improve…"
                        maxLength={2000}
                      />
                    </div>
                    {error ? <p className="text-sm text-red-600">{error}</p> : null}
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="button" disabled={rating < 1 || submitting} onClick={submit}>
                      {submitting ? "Submitting…" : "Submit"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </>
  )
}
