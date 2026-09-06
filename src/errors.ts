export class BrowserError extends Error {
  constructor(message: string) { super(message); this.name = 'BrowserError'; }
}

export class NotLaunchedError extends BrowserError {
  constructor() { super('No browser running. Call browser_launch first.'); this.name = 'NotLaunchedError'; }
}

export class StaleRefError extends BrowserError {
  constructor(public readonly freshSnapshot: string, ref: string) {
    super(`Ref ${ref} is stale — fresh snapshot attached below. Retry with one of its refs.\n\n${freshSnapshot}`);
    this.name = 'StaleRefError';
  }
}

export class LaunchError extends BrowserError {
  constructor(message: string, public readonly recovery?: string) {
    super(recovery ? `${message}\n\nManual recovery: ${recovery}` : message);
    this.name = 'LaunchError';
  }
}
