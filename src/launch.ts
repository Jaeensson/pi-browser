import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, type BrowserContextOptions } from 'playwright';
import { LaunchError } from './errors';

export type LaunchOptions = {
  mode?: 'headless' | 'headed';
  device?: string;
  viewport?: { width: number; height: number };
  colorScheme?: 'light' | 'dark';
};

export type NormalizedLaunch = {
  headless: boolean;
  colorScheme?: 'light' | 'dark';
  viewport: { width: number; height: number };
  deviceProps?: Omit<BrowserContextOptions, 'viewport'> & { viewport?: { width: number; height: number } };
  deviceName?: string;
  profileDir: string;
};

function stateRoot(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches');
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'));
  return process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
}

export function profileDirFor(cwd: string, root = stateRoot()): string {
  const hash = createHash('sha256').update(cwd).digest('hex').slice(0, 8);
  return join(root, 'pi-dev-browser', `profile-${hash}`);
}

export function normalizeLaunchOptions(opts: LaunchOptions, cwd: string): NormalizedLaunch {
  let deviceProps: NormalizedLaunch['deviceProps'];
  let deviceName: string | undefined;
  let viewport = opts.viewport ?? { width: 1280, height: 720 };

  if (opts.device) {
    const desc = (devices as Record<string, unknown>)[opts.device];
    if (!desc) {
      const names = Object.keys(devices);
      const tokens = opts.device!.toLowerCase().split(/\s+/).filter(Boolean);
      const score = (n: string) => tokens.filter(t => n.toLowerCase().includes(t)).length;
      const near = names
        .filter(n => tokens.some(t => n.toLowerCase().includes(t)))
        .sort((a, b) => score(b) - score(a) || a.localeCompare(b))
        .slice(0, 5);
      throw new LaunchError(
        `Unknown device "${opts.device}".`,
        `Use one of: ${[...new Set([...near, ...names.slice(0, 5)])].join(', ')} …`,
      );
    }
    const d = desc as BrowserContextOptions & { defaultBrowserType?: string };
    deviceName = opts.device;
    deviceProps = {
      userAgent: d.userAgent,
      deviceScaleFactor: d.deviceScaleFactor,
      isMobile: d.isMobile,
      hasTouch: d.hasTouch,
      viewport: d.viewport ?? undefined,
    };
    if (d.viewport) viewport = d.viewport;
  }

  return {
    headless: opts.mode !== 'headed',
    colorScheme: opts.colorScheme,
    viewport,
    deviceProps,
    deviceName,
    profileDir: profileDirFor(cwd),
  };
}

export function normalizeUrl(raw: string): string {
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(raw)) return `http://${raw}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return `https://${raw}`;
}

export async function installChromium(onProgress?: (m: string) => void): Promise<void> {
  const { spawn } = await import('node:child_process');
  const extDir = fileURLToPath(new URL('..', import.meta.url));
  await new Promise<void>((resolve, reject) => {
    const child = spawn('node', [join(extDir, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'], {
      cwd: extDir, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let last = 0;
    child.stdout.on('data', (buf: Buffer) => {
      const now = Date.now();
      if (now - last > 2000) { last = now; onProgress?.(`Downloading Chromium… ${buf.toString().trim().split('\n').pop()}`); }
    });
    child.stderr.on('data', (buf: Buffer) => onProgress?.(buf.toString().trim()));
    child.on('exit', code => (code === 0 ? resolve() : reject(new LaunchError(`playwright install exited ${code}`, 'npx playwright install chromium'))));
    child.on('error', reject);
  });
}
