import { describe, expect, it } from 'vitest';
import extension from '../src/index';

describe('scaffold', () => {
  it('exports a default extension factory', () => {
    expect(typeof extension).toBe('function');
  });
});
