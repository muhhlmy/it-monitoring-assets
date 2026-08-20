import { onBeforeUnmount, onMounted } from 'vue'
import gsap from 'gsap'

/**
 * Native check for prefers-reduced-motion
 */
export function isReducedMotion() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Vue 3 Composable managing GSAP Context & Lifecycle Cleanup
 * Automatically calls ctx.revert() on onBeforeUnmount to prevent memory leaks.
 */
export function useGsapContext(scopeRef) {
  let ctx = null

  onMounted(() => {
    ctx = gsap.context(() => {}, scopeRef?.value || undefined)
  })

  onBeforeUnmount(() => {
    if (ctx) {
      ctx.revert()
      ctx = null
    }
  })

  function add(fn) {
    if (ctx) {
      return ctx.add(fn)
    } else {
      return fn()
    }
  }

  return { ctx, add }
}

/**
 * Route / Page transition ENTER hook for Vue Router
 */
export function animatePageEnter(el, done) {
  if (!el) {
    if (typeof done === 'function') done()
    return
  }
  if (isReducedMotion()) {
    gsap.set(el, { opacity: 1, y: 0 })
    if (typeof done === 'function') done()
    return
  }

  gsap.fromTo(
    el,
    { opacity: 0, y: 10 },
    {
      opacity: 1,
      y: 0,
      duration: 0.25,
      ease: 'power2.out',
      clearProps: 'transform,opacity',
      onComplete: () => {
        if (typeof done === 'function') done()
      },
    },
  )
}

/**
 * Route / Page transition LEAVE hook for Vue Router
 */
export function animatePageLeave(el, done) {
  if (!el) {
    if (typeof done === 'function') done()
    return
  }
  if (isReducedMotion()) {
    gsap.set(el, { opacity: 0 })
    if (typeof done === 'function') done()
    return
  }

  gsap.to(el, {
    opacity: 0,
    y: -6,
    duration: 0.18,
    ease: 'power2.in',
    onComplete: () => {
      if (typeof done === 'function') done()
    },
  })
}

/**
 * Stagger entrance animation for card grids, table rows, and list items
 */
export function animateStagger(targets, options = {}) {
  if (!targets) return

  let els = []
  if (typeof targets === 'string') {
    els = Array.from(document.querySelectorAll(targets))
  } else if (typeof Element !== 'undefined' && targets instanceof Element) {
    els = [targets]
  } else if (Array.isArray(targets) || targets instanceof NodeList || targets instanceof HTMLCollection) {
    els = Array.from(targets)
  }

  if (!els || els.length === 0) return

  if (isReducedMotion()) {
    gsap.set(els, { opacity: 1, y: 0 })
    return
  }

  const { y = 12, duration = 0.3, stagger = 0.04, ease = 'power2.out', delay = 0 } = options

  return gsap.fromTo(
    els,
    { opacity: 0, y },
    {
      opacity: 1,
      y: 0,
      duration,
      stagger,
      ease,
      delay,
      clearProps: 'transform,opacity',
    },
  )
}

/**
 * Modal Open Transition (Backdrop fade + Modal scale/slide)
 */
export function animateModalEnter(el, done) {
  if (!el) {
    if (typeof done === 'function') done()
    return
  }
  if (isReducedMotion()) {
    gsap.set(el, { opacity: 1 })
    if (typeof done === 'function') done()
    return
  }

  const panel = el.querySelector('.app-modal-panel') || el

  gsap.fromTo(
    el,
    { opacity: 0 },
    { opacity: 1, duration: 0.2, ease: 'power2.out' },
  )

  gsap.fromTo(
    panel,
    { opacity: 0, scale: 0.96, y: 8 },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.25,
      ease: 'power3.out',
      clearProps: 'transform,opacity',
      onComplete: () => {
        if (typeof done === 'function') done()
      },
    },
  )
}

/**
 * Modal Close Transition
 */
export function animateModalLeave(el, done) {
  if (!el) {
    if (typeof done === 'function') done()
    return
  }
  if (isReducedMotion()) {
    if (typeof done === 'function') done()
    return
  }

  const panel = el.querySelector('.app-modal-panel') || el

  gsap.to(el, {
    opacity: 0,
    duration: 0.18,
    ease: 'power2.in',
  })

  gsap.to(panel, {
    opacity: 0,
    scale: 0.97,
    y: 4,
    duration: 0.18,
    ease: 'power2.in',
    onComplete: () => {
      if (typeof done === 'function') done()
    },
  })
}

/**
 * Numeric Counter Animation for Dashboard Metric Cards
 */
export function animateCounter(targetRef, endValue, duration = 0.8) {
  if (isReducedMotion() || typeof endValue !== 'number' || isNaN(endValue)) {
    targetRef.value = endValue
    return
  }

  const obj = { val: targetRef.value || 0 }
  gsap.to(obj, {
    val: endValue,
    duration,
    ease: 'power1.out',
    onUpdate: () => {
      targetRef.value = Math.round(obj.val)
    },
  })
}
