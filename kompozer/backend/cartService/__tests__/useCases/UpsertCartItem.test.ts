/**
 * Unit tests for UpsertCartItem use case.
 */
import { UpsertCartItem } from '../../src/useCases/UpsertCartItem';
import { CartConfigConflictError, ValidationError } from '../../src/domain/entities/errors';
import { FakeCartEventPublisher, FakeCartRepository } from '../helpers/fakes';

describe('UpsertCartItem', () => {
  it('adds a new item and computes total', async () => {
    const repo = new FakeCartRepository();
    const publisher = new FakeCartEventPublisher();
    const useCase = new UpsertCartItem(repo, publisher);

    const cart = await useCase.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Ripiano',
      unitPrice: 1990,
      quantity: 2,
    });

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].lineTotal).toBe(3980);
    expect(cart.total).toBe(3980);
    expect(publisher.events.map((event) => event.type)).toEqual(['CartCreated', 'ItemAddedToCart']);
  });

  it('updates existing item quantity', async () => {
    const repo = new FakeCartRepository();
    const publisher = new FakeCartEventPublisher();
    const useCase = new UpsertCartItem(repo, publisher);

    await useCase.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Ripiano',
      unitPrice: 1990,
      quantity: 1,
    });

    const cart = await useCase.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Ripiano',
      unitPrice: 1990,
      quantity: 3,
    });

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(3);
    expect(cart.total).toBe(5970);
    expect(publisher.events.map((event) => event.type)).toEqual(['CartCreated', 'ItemAddedToCart']);
  });

  it('throws ValidationError on non-positive quantity', async () => {
    const repo = new FakeCartRepository();
    const useCase = new UpsertCartItem(repo);

    await expect(
      useCase.execute({
        userId: 'usr_1',
        sku: 'SKU-001',
        name: 'Ripiano',
        unitPrice: 1990,
        quantity: 0,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError on negative unitPrice', async () => {
    const repo = new FakeCartRepository();
    const useCase = new UpsertCartItem(repo);

    await expect(
      useCase.execute({
        userId: 'usr_1',
        sku: 'SKU-001',
        name: 'Ripiano',
        unitPrice: -10,
        quantity: 1,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('tags the cart with configId/configName on the first configuration push', async () => {
    const repo = new FakeCartRepository();
    const useCase = new UpsertCartItem(repo);

    const cart = await useCase.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Montante',
      unitPrice: 1990,
      quantity: 2,
      configId: 'cfg_1',
      configName: 'Libreria salotto',
    });

    expect(cart.configId).toBe('cfg_1');
    expect(cart.configName).toBe('Libreria salotto');
  });

  it('allows more items from the same configuration', async () => {
    const repo = new FakeCartRepository();
    const useCase = new UpsertCartItem(repo);

    await useCase.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Montante',
      unitPrice: 1990,
      quantity: 2,
      configId: 'cfg_1',
      configName: 'Libreria salotto',
    });

    const cart = await useCase.execute({
      userId: 'usr_1',
      sku: 'SKU-002',
      name: 'Ripiano',
      unitPrice: 990,
      quantity: 4,
      configId: 'cfg_1',
      configName: 'Libreria salotto',
    });

    expect(cart.items).toHaveLength(2);
    expect(cart.configId).toBe('cfg_1');
  });

  it('rejects pushing a different configuration into a cart already tied to one', async () => {
    const repo = new FakeCartRepository();
    const useCase = new UpsertCartItem(repo);

    await useCase.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Montante',
      unitPrice: 1990,
      quantity: 2,
      configId: 'cfg_1',
      configName: 'Libreria salotto',
    });

    await expect(
      useCase.execute({
        userId: 'usr_1',
        sku: 'SKU-999',
        name: 'Montante',
        unitPrice: 1990,
        quantity: 1,
        configId: 'cfg_2',
        configName: 'Libreria studio',
      }),
    ).rejects.toThrow(CartConfigConflictError);
  });

  it('rejects pushing a configuration into a cart with manually added catalog items', async () => {
    const repo = new FakeCartRepository();
    const useCase = new UpsertCartItem(repo);

    await useCase.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Accessorio',
      unitPrice: 500,
      quantity: 1,
    });

    await expect(
      useCase.execute({
        userId: 'usr_1',
        sku: 'SKU-002',
        name: 'Montante',
        unitPrice: 1990,
        quantity: 1,
        configId: 'cfg_1',
        configName: 'Libreria salotto',
      }),
    ).rejects.toThrow(CartConfigConflictError);
  });

  it('rejects manually adding a catalog item to a cart reserved for a configuration', async () => {
    const repo = new FakeCartRepository();
    const useCase = new UpsertCartItem(repo);

    await useCase.execute({
      userId: 'usr_1',
      sku: 'SKU-001',
      name: 'Montante',
      unitPrice: 1990,
      quantity: 1,
      configId: 'cfg_1',
      configName: 'Libreria salotto',
    });

    await expect(
      useCase.execute({
        userId: 'usr_1',
        sku: 'SKU-002',
        name: 'Accessorio',
        unitPrice: 500,
        quantity: 1,
      }),
    ).rejects.toThrow(CartConfigConflictError);
  });
});
