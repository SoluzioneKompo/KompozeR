/**
 * Unit tests for RedisCatalogEventPublisher adapter.
 */
import { CATALOG_EVENTS_STREAM, RedisCatalogEventPublisher } from '../../../src/adapters/messaging/publishers/RedisCatalogEventPublisher';
import { PriceChangedEvent } from '../../../src/domain/entities/CatalogEvent';

describe('RedisCatalogEventPublisher', () => {
  it('appends catalog events to the catalog:events stream as a JSON payload field, trimmed', async () => {
    const xadd = jest.fn().mockResolvedValue('1-0');
    const redis = { xadd };
    const publisher = new RedisCatalogEventPublisher(redis as never);

    const event: PriceChangedEvent = {
      eventId: 'evt_1',
      type: 'PRICE_CHANGED',
      occurredAt: new Date(),
      componentId: 'comp_1',
      sku: 'SKU-001',
      changedBy: 'adm_1',
      oldPrice: 100,
      newPrice: 200,
    };

    await publisher.publish(event);

    expect(xadd).toHaveBeenCalledTimes(1);
    expect(xadd).toHaveBeenCalledWith(CATALOG_EVENTS_STREAM, 'MAXLEN', '~', 10_000, '*', 'payload', JSON.stringify(event));
  });
});
