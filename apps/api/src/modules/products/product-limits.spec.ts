import { ForbiddenException } from '@nestjs/common';
import { assertCanAddProducts, getProductCapacity } from './product-limits';

const db = (maxProducts: number | null, count: number) => ({
  query: jest.fn().mockResolvedValue([{ maxProducts, count }]),
});

describe('product limits', () => {
  it('no limit → always allowed', async () => {
    await expect(assertCanAddProducts(db(null, 10_000), 't', 500)).resolves.toBeUndefined();
    expect((await getProductCapacity(db(null, 3), 't')).remaining).toBe(Infinity);
  });

  it('allows up to the limit exactly', async () => {
    await expect(assertCanAddProducts(db(10, 9), 't')).resolves.toBeUndefined();
    await expect(assertCanAddProducts(db(10, 7), 't', 3)).resolves.toBeUndefined();
  });

  it('blocks when the limit would be exceeded', async () => {
    await expect(assertCanAddProducts(db(10, 10), 't')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assertCanAddProducts(db(10, 8), 't', 3)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('adding 0 never queries', async () => {
    const d = db(1, 5);
    await assertCanAddProducts(d, 't', 0);
    expect(d.query).not.toHaveBeenCalled();
  });
});
