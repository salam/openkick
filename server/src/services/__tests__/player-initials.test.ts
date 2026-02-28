import { describe, it, expect } from 'vitest';
import { computeInitials } from '../player-initials.js';

describe('computeInitials', () => {
  it('should return first initial with dot', () => {
    const result = computeInitials([
      { id: 1, name: 'Jonas', lastNameInitial: null },
      { id: 2, name: 'Felix', lastNameInitial: null },
      { id: 3, name: 'Karl', lastNameInitial: null }
    ]);
    expect(result).toEqual([
      { id: 1, initial: 'J.' },
      { id: 2, initial: 'F.' },
      { id: 3, initial: 'K.' }
    ]);
  });

  it('should disambiguate with last-name initial when first initials collide', () => {
    const result = computeInitials([
      { id: 1, name: 'Jonas', lastNameInitial: 'M' },
      { id: 2, name: 'Jan', lastNameInitial: 'S' },
      { id: 3, name: 'Felix', lastNameInitial: null }
    ]);
    expect(result).toEqual([
      { id: 1, initial: 'J. M.' },
      { id: 2, initial: 'J. S.' },
      { id: 3, initial: 'F.' }
    ]);
  });

  it('should fall back to first initial only when collision exists but no lastNameInitial', () => {
    const result = computeInitials([
      { id: 1, name: 'Jonas', lastNameInitial: null },
      { id: 2, name: 'Jan', lastNameInitial: 'S' }
    ]);
    expect(result).toEqual([
      { id: 1, initial: 'J.' },
      { id: 2, initial: 'J. S.' }
    ]);
  });

  it('should handle empty array', () => {
    expect(computeInitials([])).toEqual([]);
  });
});
