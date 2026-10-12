import { describe, expect, it } from 'vitest';
import { formatUtc, humanizeSlug } from './formatters';

describe('humanizeSlug', () => {
  it('capitalises the first word and spaces the rest', () => {
    expect(humanizeSlug('deleted-recoverable')).toBe('Deleted recoverable');
  });

  it('keeps filesystem acronyms in capitals', () => {
    expect(humanizeSlug('mft-modified')).toBe('MFT modified');
  });
});

describe('formatUtc', () => {
  it('always states the zone and keeps milliseconds', () => {
    expect(formatUtc('2019-03-12T08:00:00.000Z')).toBe('2019-03-12 08:00:00.000 UTC');
  });
});
