// Who has a live socket, counted per account. Pure bookkeeping: the first
// connection of an account is "came online", the last disconnect "went
// offline"; a second tab changes nothing.

export type PresenceKey = `user:${number}` | `admin:${number}`;

export class PresenceRegistry {
  private readonly counts = new Map<PresenceKey, number>();

  // True when the account just came online.
  connect(key: PresenceKey) {
    const next = (this.counts.get(key) ?? 0) + 1;

    this.counts.set(key, next);
    return next === 1;
  }

  // True when the account just went offline.
  disconnect(key: PresenceKey) {
    const current = this.counts.get(key) ?? 0;

    if (current <= 1) {
      this.counts.delete(key);
      return current === 1;
    }
    this.counts.set(key, current - 1);
    return false;
  }

  isOnline(key: PresenceKey) {
    return this.counts.has(key);
  }

  onlineAdminIds() {
    return [...this.counts.keys()]
      .filter((key) => key.startsWith("admin:"))
      .map((key) => Number(key.slice("admin:".length)));
  }

  clear() {
    this.counts.clear();
  }
}
