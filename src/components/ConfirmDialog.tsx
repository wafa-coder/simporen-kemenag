import { useEffect, useRef, useState } from 'react';
import { useDialogLightDismiss } from '../lib/useDialogLightDismiss';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  destructive?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Batal',
  requireReason = false,
  reasonLabel = 'Catatan Revisi',
  reasonPlaceholder = 'Tuliskan bagian yang perlu diperbaiki operator...',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setReason('');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    if (dialogRef.current) {
      dialogRef.current.returnValue = '';
    }
    onCancel();
  };

  useDialogLightDismiss(dialogRef, handleClose, open && !busy);

  const handleSubmit = async () => {
    if (requireReason && !reason.trim()) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-dialog-title"
      {...({ closedby: busy ? 'none' : 'any' } as Record<string, string>)}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) handleClose();
      }}
      onClose={() => {
        if (open && !busy) handleClose();
      }}
      className="m-auto w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#131419] p-6 text-[#FAFAFA] shadow-2xl"
    >
      <h2 id="confirm-dialog-title" className="text-lg font-semibold text-[#FAFAFA]">
        {title}
      </h2>
      <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">{description}</p>

      {requireReason && (
        <div className="mt-4">
          <label htmlFor="confirm-reason-input" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
            {reasonLabel} <span className="text-white font-semibold">*</span>
          </label>
          <textarea
            id="confirm-reason-input"
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            className="field-input w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-emerald-400/70 focus:outline-none"
          />
          <p className="field-error mt-1 text-xs text-white font-medium">Catatan revisi wajib diisi.</p>
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={handleClose}
          className="px-4 py-2 text-sm font-medium text-[#E4E4E7] bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] rounded-xl transition-colors whitespace-nowrap shrink-0"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={busy || (requireReason && !reason.trim())}
          onClick={handleSubmit}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
            destructive
              ? 'bg-white hover:bg-zinc-200 text-[#09090B] ring-1 ring-white/40'
              : 'bg-emerald-500 hover:bg-emerald-400 text-[#041D13]'
          }`}
        >
          {busy ? 'Memproses...' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
