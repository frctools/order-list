import { LazyConfirmDialog } from '#components'

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  color?: 'error' | 'primary' | 'warning' | 'neutral'
  icon?: string
}

/**
 * Promise-based replacement for window.confirm that matches the app's UI.
 *
 *   if (!(await confirm({ title: 'Delete order?' }))) return
 */
export function useConfirm() {
  const overlay = useOverlay()
  const modal = overlay.create(LazyConfirmDialog)

  return async function confirm(options: ConfirmOptions): Promise<boolean> {
    const instance = modal.open(options)
    return Boolean(await instance.result)
  }
}
