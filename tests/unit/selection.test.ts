import { describe, expect, it } from 'vitest';
import { clickSelection } from '../../src/domain/selection';

describe('selection in the visible item order', () => {
  const order = ['a', 'b', 'c', 'd'];
  it('adds a range without losing selections outside that range', () => {
    expect([...clickSelection(new Set(['a']), 'd', true, 'b', order, true)]).toEqual(order);
  });
  it('removes a reverse range and leaves unrelated selections intact', () => {
    expect([...clickSelection(new Set(order), 'b', false, 'd', order, true)]).toEqual(['a']);
  });
  it('falls back to the clicked item if an old anchor is no longer visible', () => {
    expect([...clickSelection(new Set(['a']), 'c', true, 'gone', order, true)]).toEqual(['a', 'c']);
    expect([...clickSelection(new Set(order), 'c', false, 'a', order, false)]).toEqual([
      'a',
      'b',
      'd',
    ]);
  });
});
