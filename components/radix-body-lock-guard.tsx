"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { releaseStuckRadixBodyLock } from "@/lib/radix-body-lock"

/**
 * Clears stale Radix scroll/pointer locks so header dropdowns and CTAs keep working
 * after dialogs, sheets, or menus close.
 */
export function RadixBodyLockGuard() {
  const pathname = usePathname()

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7250/ingest/899a54e3-630f-4a58-9118-5614b7eb5753',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'917a96'},body:JSON.stringify({sessionId:'917a96',runId:'run1',hypothesisId:'E',location:'radix-body-lock-guard.tsx:mount',message:'RadixBodyLockGuard active',data:{pathname},timestamp:Date.now()})}).catch(()=>{})
    // #endregion
    releaseStuckRadixBodyLock()
    const t = window.setTimeout(releaseStuckRadixBodyLock, 400)
    return () => window.clearTimeout(t)
  }, [pathname])

  useEffect(() => {
    // #region agent log
    const logClick = (e: PointerEvent) => {
      try {
        const t = e.target as Element | null
        const bodyPE = getComputedStyle(document.body).pointerEvents
        const htmlPE = getComputedStyle(document.documentElement).pointerEvents
        const openLayers = document.querySelectorAll(
          '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[role="menu"][data-state="open"],[data-radix-menu-content][data-state="open"],[role="listbox"][data-state="open"]'
        ).length
        const atPoint = document.elementFromPoint(e.clientX, e.clientY) as Element | null
        const triggerBtn = t?.closest?.('[aria-haspopup="menu"]') as HTMLElement | null
        fetch('http://127.0.0.1:7250/ingest/899a54e3-630f-4a58-9118-5614b7eb5753',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'917a96'},body:JSON.stringify({sessionId:'917a96',runId:'run1',hypothesisId:'A,D,E',location:'radix-body-lock-guard.tsx:pointerdown',message:'CTA pointerdown state',data:{
          bodyPointerEvents: bodyPE,
          htmlPointerEvents: htmlPE,
          bodyScrollLocked: document.body.hasAttribute('data-scroll-locked'),
          bodyAriaHidden: document.body.getAttribute('aria-hidden'),
          openRadixLayers: openLayers,
          targetTag: t?.tagName || null,
          targetHasPopup: t?.closest?.('[aria-haspopup="menu"]') ? true : false,
          triggerAriaExpanded: triggerBtn?.getAttribute('aria-expanded') ?? null,
          elementFromPointTag: atPoint?.tagName || null,
          elementFromPointClass: (atPoint?.getAttribute?.('class') || '').slice(0,120),
          clickHitsTrigger: !!(triggerBtn && atPoint && (triggerBtn === atPoint || triggerBtn.contains(atPoint) || atPoint.contains(triggerBtn))),
        },timestamp:Date.now()})}).catch(()=>{})
      } catch {}
    }
    document.addEventListener("pointerdown", logClick, true)

    // Poller: independent of pointer events, so it still reports when the page is "dead".
    let tick = 0
    const poll = window.setInterval(() => {
      try {
        tick++
        const bodyPE = getComputedStyle(document.body).pointerEvents
        const htmlPE = getComputedStyle(document.documentElement).pointerEvents
        const openLayers = document.querySelectorAll(
          '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[role="menu"][data-state="open"],[data-radix-menu-content][data-state="open"],[role="listbox"][data-state="open"]'
        ).length
        const cta = document.querySelector('[aria-label="Quick add"],[aria-haspopup="menu"]') as HTMLElement | null
        let ctaCovered: boolean | null = null
        let coveringTag: string | null = null
        let coveringClass: string | null = null
        if (cta) {
          const r = cta.getBoundingClientRect()
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as Element | null
          ctaCovered = !(el && (el === cta || cta.contains(el) || el.contains(cta)))
          coveringTag = el?.tagName || null
          coveringClass = (el?.getAttribute?.("class") || "").slice(0, 140)
        }
        const stuck = bodyPE === "none" || htmlPE === "none"
        // Log only anomalies + a periodic heartbeat, to keep the file readable.
        if (stuck || ctaCovered || tick % 3 === 0) {
          fetch('http://127.0.0.1:7250/ingest/899a54e3-630f-4a58-9118-5614b7eb5753',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'917a96'},body:JSON.stringify({sessionId:'917a96',runId:'run2',hypothesisId:'A,B,D',location:'radix-body-lock-guard.tsx:poll',message:'poll page interactivity',data:{
            tick,
            bodyComputedPE: bodyPE,
            htmlComputedPE: htmlPE,
            bodyInlinePE: document.body.style.pointerEvents,
            htmlInlinePE: document.documentElement.style.pointerEvents,
            bodyScrollLocked: document.body.hasAttribute("data-scroll-locked"),
            openRadixLayers: openLayers,
            ctaFound: !!cta,
            ctaAriaLabel: cta?.getAttribute("aria-label") || cta?.getAttribute("aria-haspopup") || null,
            ctaCovered,
            coveringTag,
            coveringClass,
          },timestamp:Date.now()})}).catch(()=>{})
        }
      } catch {}
    }, 1000)
    // #endregion

    const run = () => releaseStuckRadixBodyLock()

    document.addEventListener("pointerdown", run, true)
    document.addEventListener("focusin", run, true)

    const obs = new MutationObserver(run)
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "data-scroll-locked", "aria-hidden"],
    })

    return () => {
      // #region agent log
      document.removeEventListener("pointerdown", logClick, true)
      window.clearInterval(poll)
      // #endregion
      document.removeEventListener("pointerdown", run, true)
      document.removeEventListener("focusin", run, true)
      obs.disconnect()
    }
  }, [])

  return null
}
