import { SSE_MAX_BACKLOG } from '@kiosk/shared';

/**
 * In-process event bus with a bounded backlog so SSE clients that connect
 * after an event still receive recent history.
 */
export class EventBus {
  constructor() {
    this.listeners = new Set();
    this.backlog = [];
    this.seq = 0;
  }

  publish(event) {
    this.seq += 1;
    const record = { ...event, seq: this.seq, publishedAt: new Date().toISOString() };
    this.backlog.push(record);
    if (this.backlog.length > SSE_MAX_BACKLOG) {
      this.backlog.splice(0, this.backlog.length - SSE_MAX_BACKLOG);
    }
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch {
        // A failing listener must not break publishing.
      }
    }
    return record;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  recent() {
    return [...this.backlog];
  }
}
