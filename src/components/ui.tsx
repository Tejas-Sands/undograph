import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Check, Circle, Clock3, TriangleAlert, X } from 'lucide-react'

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red'
}) {
  const Icon =
    tone === 'green'
      ? Check
      : tone === 'amber' || tone === 'red'
        ? TriangleAlert
        : tone === 'blue'
          ? Clock3
          : Circle
  return (
    <span className={`badge badge-${tone}`}>
      <Icon size={12} aria-hidden="true" />
      {children}
    </span>
  )
}

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])
  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={onClose}>
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
