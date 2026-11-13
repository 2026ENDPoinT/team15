import { useCallback, useEffect, useRef } from 'react';

// Only the card that acquired a lock may release it. Moving into another card
// or unmounting an idle card must not unlock the active gesture.
export function useCardTouchLock(onDragging: (locked: boolean) => void) {
  const locked = useRef(false);
  const dragging = useRef(false);
  const acquire = useCallback(() => {
    if (locked.current) return;
    locked.current = true;
    onDragging(true);
  }, [onDragging]);
  const release = useCallback(() => {
    dragging.current = false;
    if (!locked.current) return;
    locked.current = false;
    onDragging(false);
  }, [onDragging]);
  const startDrag = useCallback(() => {
    dragging.current = true;
    acquire();
  }, [acquire]);
  const endTouch = useCallback(() => {
    if (!dragging.current) release();
  }, [release]);
  useEffect(() => release, [release]);
  return { acquire, release, startDrag, endTouch, locked };
}
