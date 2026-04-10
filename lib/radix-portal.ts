/**
 * Radix Dialog/Sheet dismiss via pointer/focus "outside" the content node.
 * Popover, Select, DropdownMenu, etc. render in a portal, so their surfaces
 * are outside the dialog DOM — without this guard, clicks never reach items.
 */
function elementMatchesPortaledSurface(el: Element): boolean {
  return !!(
    el.closest("[data-radix-popper-content-wrapper]") ||
    el.closest("[data-radix-popover-content]") ||
    el.closest("[data-radix-popover-content-wrapper]") ||
    el.closest("[data-radix-select-viewport]") ||
    el.closest("[data-radix-select-content]") ||
    el.closest("[data-radix-menu-content]") ||
    el.closest("[data-radix-dropdown-menu-content]") ||
    el.closest("[data-radix-tooltip-content]") ||
    el.closest("[data-radix-tooltip-content-wrapper]") ||
    // cmdk inside Popover (e.g. CategoryCombobox)
    el.closest("[cmdk-root]") ||
    el.closest("[cmdk-list]") ||
    el.closest("[cmdk-item]") ||
    el.closest("[cmdk-input-wrapper]") ||
    el.closest("[cmdk-group]") ||
    el.closest("[cmdk-empty]")
  )
}

/** Single target (e.g. focus events) — use closest from event.target. */
export function isInsideRadixPortaledSurface(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false
  return elementMatchesPortaledSurface(target)
}

/** Radix DismissableLayer passes a CustomEvent with the real pointer/focus on `detail.originalEvent`. */
type RadixOutsideEventLike = {
  target: EventTarget | null
  composedPath?: () => EventTarget[]
  detail?: { originalEvent?: Event }
}

function getNativeOutsideEvent(e: RadixOutsideEventLike): Event {
  const orig = e.detail?.originalEvent
  if (orig && typeof orig === "object") return orig
  return e as unknown as Event
}

/**
 * Pointer/outside handlers: use the native event from Radix (see `getNativeOutsideEvent`).
 * The CustomEvent's own `composedPath()` is not reliable for portaled clicks.
 */
export function isRadixPortaledInteraction(e: RadixOutsideEventLike): boolean {
  const native = getNativeOutsideEvent(e)
  if (typeof native.composedPath === "function") {
    for (const node of native.composedPath()) {
      if (node instanceof Element && elementMatchesPortaledSurface(node)) return true
    }
  }
  const t = native.target ?? e.target
  return isInsideRadixPortaledSurface(t)
}
