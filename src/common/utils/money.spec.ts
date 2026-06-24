import { add, money, mul, round, sub, toJson } from './money';

describe('money utils', () => {
  it('adds without floating point error', () => {
    // 0.1 + 0.2 must equal 0.30, not 0.30000000000000004
    expect(add(0.1, 0.2).toString()).toBe('0.3');
  });

  it('rounds half-up to 2 dp', () => {
    expect(round('10.005').toString()).toBe('10.01');
    expect(round(2.444).toString()).toBe('2.44');
  });

  it('multiplies quantities and prices exactly', () => {
    expect(mul(10000, 2).toString()).toBe('20000');
    expect(mul('700', 20).toString()).toBe('14000');
  });

  it('subtracts to compute change', () => {
    expect(sub(25000, 20000).toString()).toBe('5000');
  });

  it('serializes to fixed 2 dp string', () => {
    expect(toJson(20000)).toBe('20000.00');
    expect(toJson(money('39000'))).toBe('39000.00');
  });
});
