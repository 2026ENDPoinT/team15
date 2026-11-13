// Unseen entries keep their source order; deferred entries follow in FIFO order.
export function orderNoticeQueue<T extends { id: string }>(
  notices: readonly T[],
  deferredIds: readonly string[],
  promotedId?: string | null,
): T[] {
  const positions = new Map(deferredIds.map((id, index) => [id, index]));
  const rank = (id: string) =>
    positions.has(id) ? positions.get(id)! + 1 : id === promotedId ? -1 : 0;
  return [...notices].sort((a, b) => rank(a.id) - rank(b.id));
}

export function deferNotice(ids: readonly string[], id: string): string[] {
  return [...ids.filter((entry) => entry !== id), id];
}
