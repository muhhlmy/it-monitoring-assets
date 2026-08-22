import { onUnmounted } from 'vue'

export function useRequestCancellation() {
  let activeController = null

  function getSignal() {
    if (activeController) {
      activeController.abort()
    }
    activeController = new AbortController()
    return activeController.signal
  }

  function cancel() {
    if (activeController) {
      activeController.abort()
      activeController = null
    }
  }

  onUnmounted(() => {
    cancel()
  })

  return {
    getSignal,
    cancel,
  }
}
