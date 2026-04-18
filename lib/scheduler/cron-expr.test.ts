import { describe, expect, it } from 'bun:test';
import { cronExprForMinutes } from './index';

describe('cronExprForMinutes', () => {
  it('uses */N minute-step for sub-hour intervals', () => {
    expect(cronExprForMinutes(1)).toBe('*/1 * * * *');
    expect(cronExprForMinutes(5)).toBe('*/5 * * * *');
    expect(cronExprForMinutes(15)).toBe('*/15 * * * *');
    expect(cronExprForMinutes(59)).toBe('*/59 * * * *');
  });

  it('collapses whole-hour intervals to hour-step', () => {
    expect(cronExprForMinutes(60)).toBe('0 */1 * * *');
    expect(cronExprForMinutes(120)).toBe('0 */2 * * *');
    expect(cronExprForMinutes(360)).toBe('0 */6 * * *');
  });

  it('collapses whole-day intervals to day-step', () => {
    expect(cronExprForMinutes(24 * 60)).toBe('0 0 */1 * *');
    expect(cronExprForMinutes(48 * 60)).toBe('0 0 */2 * *');
  });

  it('keeps hour granularity for non-day multiples', () => {
    expect(cronExprForMinutes(90)).toBe('*/90 * * * *');
    expect(cronExprForMinutes(75)).toBe('*/75 * * * *');
  });
});
