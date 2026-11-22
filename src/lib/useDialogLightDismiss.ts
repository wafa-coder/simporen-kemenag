import { useEffect, type RefObject } from 'react';

export interface ClientPointRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function isPointOutsideRect(
  clientX: number,
  clientY: number,
  rect: ClientPointRect,
): boolean {
  return (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  );
}

/**
 * Progressive-enhancement light-dismiss fallback for <dialog closedby="any">
 * in browsers lacking native HTMLDialogElement.prototype.closedBy (e.g. Safari).
 * Requires both pointerdown and pointerup outside the dialog box so text-selection
 * drags ending on ::backdrop never dismiss unintentionally.
 */
export function useDialogLightDismiss(
  dialogRef: RefObject<HTMLDialogElement | null>,
  onDismiss: () => void,
  enabled = true,
): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !enabled) return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const handlePointerDown = (e: PointerEvent) => {
      pressedOutside = isPointOutsideRect(
        e.clientX,
        e.clientY,
        dialog.getBoundingClientRect(),
      );
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (
        pressedOutside &&
        isPointOutsideRect(e.clientX, e.clientY, dialog.getBoundingClientRect())
      ) {
        onDismiss();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dialogRef, onDismiss, enabled]);
}
