import { PI_MAX_BYTES } from './response';

export class BrowserError extends Error {
  constructor(message: string) { super(message); this.name = 'BrowserError'; }
}

export class NotLaunchedError extends BrowserError {
  constructor() { super('No browser running. Call browser_launch first.'); this.name = 'NotLaunchedError'; }
}

export class StaleRefError extends BrowserError {
  readonly freshSnapshot: string;
  constructor(rawSnapshot: string, ref: string) {
    // The snapshot competes with the rest of the tool result for the 50KB cap, so
    // an oversized one is truncated with a pointer back to browser_snapshot.
    const snap = rawSnapshot.length > PI_MAX_BYTES
      ? `${rawSnapshot.slice(0, PI_MAX_BYTES)}\n\n[Snapshot truncated at 50KB — re-call browser_snapshot with a selector.]`
      : rawSnapshot;
    // Empty last-rendered cache (fresh store, e.g. never rendered or just
    // invalidated): nothing is attached, so the message must not say "below".
    super(rawSnapshot
      ? `Ref ${ref} is stale — fresh snapshot attached below. Retry with one of its refs.\n\n${snap}`
      : `Ref ${ref} is stale or unknown — re-call browser_snapshot to get fresh refs.`);
    this.freshSnapshot = snap;
    this.name = 'StaleRefError';
  }
}

export class LaunchError extends BrowserError {
  constructor(message: string, public readonly recovery?: string) {
    super(recovery ? `${message}\n\nManual recovery: ${recovery}` : message);
    this.name = 'LaunchError';
  }
}
