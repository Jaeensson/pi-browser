import { describe, expect, it } from 'vitest';
import { normalizeLaunchOptions, normalizeUrl, profileDirFor } from '../src/launch';

describe('normalizeLaunchOptions', () => {
  it('defaults to headless 1280x720', () => {
    const n = normalizeLaunchOptions({}, '/tmp/proj');
    expect(n.headless).toBe(true);
    expect(n.viewport).toEqual({ width: 1280, height: 720 });
    expect(n.profileDir).toMatch(/profile-[0-9a-f]{8}$/);
  });
  it('headed mode flips headless off', () => {
    expect(normalizeLaunchOptions({ mode: 'headed' }, '/p').headless).toBe(false);
  });
  it('device preset supplies full emulation props and its viewport', () => {
    const n = normalizeLaunchOptions({ device: 'iPhone 15' }, '/p');
    expect(n.deviceName).toBe('iPhone 15');
    expect(n.deviceProps).toMatchObject({ isMobile: true, hasTouch: true });
    expect(n.viewport).toEqual(n.deviceProps!.viewport);
  });
  it('unknown device lists suggestions', () => {
    expect(() => normalizeLaunchOptions({ device: 'iPhon 15' }, '/p')).toThrow(/iPhone 15/);
  });
  it('same cwd maps to same profile dir; different cwd differs', () => {
    expect(profileDirFor('/a')).toBe(profileDirFor('/a'));
    expect(profileDirFor('/a')).not.toBe(profileDirFor('/b'));
  });
});

describe('normalizeUrl', () => {
  it('prepends http:// for bare localhost', () => {
    expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeUrl('localhost:3000/app')).toBe('http://localhost:3000/app');
    expect(normalizeUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
  });
  it('prepends https:// for other bare hosts', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
  });
  it('keeps existing schemes', () => {
    expect(normalizeUrl('http://x.dev')).toBe('http://x.dev');
    expect(normalizeUrl('file:///tmp/a.html')).toBe('file:///tmp/a.html');
  });
});
