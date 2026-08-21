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
  let called = false
  const safeDone = () => {
    if (called) return
    called = true
    if (typeof done === 'function') {
      try {
        done()
      } catch (err) {
        console.warn('[PageEnter] Navigation transition hook handled:', err?.message)
      }
    }
  }

  if (!el || !el.isConnected || !el.parentNode) {
    safeDone()
    return
  }

  if (isReducedMotion()) {
    try {
      gsap.set(el, { opacity: 1, y: 0 })
    } catch {}
    safeDone()
    return
  }

  try {
    gsap.killTweensOf(el)
    gsap.fromTo(
      el,
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: 0.25,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
        onComplete: safeDone,
        onInterrupt: safeDone,
      },
    )
    setTimeout(safeDone, 350)
  } catch (err) {
    console.warn('[PageEnter] GSAP fallback triggered:', err?.message)
    safeDone()
  }
}

/**
 * Route / Page transition LEAVE hook for Vue Router
 */
export function animatePageLeave(el, done) {
  let called = false
  const safeDone = () => {
    if (called) return
    called = true
    if (typeof done === 'function') {
      try {
        done()
      } catch (err) {
        console.warn('[PageLeave] Navigation transition hook handled:', err?.message)
      }
    }
  }

  if (!el || !el.isConnected || !el.parentNode) {
    safeDone()
    return
  }

  if (isReducedMotion()) {
    try {
      gsap.set(el, { opacity: 0 })
    } catch {}
    safeDone()
    return
  }

  try {
    gsap.killTweensOf(el)
    gsap.to(el, {
      opacity: 0,
      y: -6,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: safeDone,
      onInterrupt: safeDone,
    })
    setTimeout(safeDone, 280)
  } catch (err) {
    console.warn('[PageLeave] GSAP fallback triggered:', err?.message)
    safeDone()
  }
}

/**
 * Stagger entrance animation for card grids, table rows, and list items
 */
export function animateStagger(targets, options = {}) {
  if (!targets) return

  let els = []
  if (typeof targets === 'string') {
    if (typeof document === 'undefined') return
    els = Array.from(document.querySelectorAll(targets)).filter((el) => el && el.isConnected)
  } else if (typeof Element !== 'undefined' && targets instanceof Element) {
    if (targets.isConnected) els = [targets]
  } else if (
    Array.isArray(targets) ||
    targets instanceof NodeList ||
    targets instanceof HTMLCollection
  ) {
    els = Array.from(targets).filter((el) => el && el.isConnected)
  }

  if (!els || els.length === 0) return

  if (isReducedMotion()) {
    try {
      gsap.set(els, { opacity: 1, y: 0 })
    } catch {}
    return
  }

  const { y = 12, duration = 0.3, stagger = 0.04, ease = 'power2.out', delay = 0 } = options

  try {
    gsap.killTweensOf(els)
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
  } catch (err) {
    console.warn('[Stagger Animation] GSAP error handled:', err?.message)
  }
}

/**
 * Modal Open Transition (Backdrop fade + Modal scale/slide)
 */
export function animateModalEnter(el, done) {
  let called = false
  const safeDone = () => {
    if (called) return
    called = true
    if (typeof done === 'function') {
      try {
        done()
      } catch (err) {
        console.warn('[ModalEnter] Transition hook handled:', err?.message)
      }
    }
  }

  if (!el || !el.isConnected) {
    safeDone()
    return
  }

  if (isReducedMotion()) {
    try {
      gsap.set(el, { opacity: 1 })
    } catch {}
    safeDone()
    return
  }

  try {
    const panel = el.querySelector('.app-modal-panel') || el
    gsap.killTweensOf([el, panel])

    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' })

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
        onComplete: safeDone,
        onInterrupt: safeDone,
      },
    )
    setTimeout(safeDone, 350)
  } catch (err) {
    console.warn('[ModalEnter] GSAP fallback triggered:', err?.message)
    safeDone()
  }
}

/**
 * Modal Close Transition
 */
export function animateModalLeave(el, done) {
  let called = false
  const safeDone = () => {
    if (called) return
    called = true
    if (typeof done === 'function') {
      try {
        done()
      } catch (err) {
        console.warn('[ModalLeave] Transition hook handled:', err?.message)
      }
    }
  }

  if (!el || !el.isConnected) {
    safeDone()
    return
  }

  if (isReducedMotion()) {
    safeDone()
    return
  }

  try {
    const panel = el.querySelector('.app-modal-panel') || el
    gsap.killTweensOf([el, panel])

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
      onComplete: safeDone,
      onInterrupt: safeDone,
    })
    setTimeout(safeDone, 280)
  } catch (err) {
    console.warn('[ModalLeave] GSAP fallback triggered:', err?.message)
    safeDone()
  }
}

/**
 * Numeric Counter Animation for Dashboard Metric Cards
 */
export function animateCounter(targetRef, endValue, duration = 0.8) {
  if (isReducedMotion() || typeof endValue !== 'number' || isNaN(endValue)) {
    if (targetRef) targetRef.value = endValue
    return
  }

  try {
    const obj = { val: targetRef.value || 0 }
    gsap.to(obj, {
      val: endValue,
      duration,
      ease: 'power1.out',
      onUpdate: () => {
        if (targetRef) targetRef.value = Math.round(obj.val)
      },
    })
  } catch (err) {
    if (targetRef) targetRef.value = endValue
  }
}
