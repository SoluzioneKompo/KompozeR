/**
 * Use case for adding a new component to the catalog.
 *
 * Requires ADMIN role (enforced at HTTP layer by auth middleware, not here).
 * SKU is derived from category/Type/dimensions (see generateSku), never
 * accepted from the client — this keeps it consistent and tamper-proof.
 * Throws ValidationError (422) when required input is invalid.
 */
import { ComponentRepository }                from '../domain/ports/ComponentRepository';
import { Clock }                              from '../domain/ports/Clock';
import { IdGenerator }                        from '../domain/ports/IdGenerator';
import { ValidationError }                    from '../domain/entities/errors';
import { generateSku }                        from '../domain/services/generateSku';
import { CreateComponentInput, ComponentDto } from './types';
import { Component }                          from '../domain/entities/Component';

function toDto(c: Component): ComponentDto {
  return {
    id:             c.id,
    sku:            c.sku,
    name:           c.name,
    description:    c.description,
    category:       c.category,
    Type:           c.Type,
    price:          c.price,
    isAvailable:    c.isAvailable,
    imageUrl:       c.imageUrl,
    dimensions:     c.dimensions,
    compatibleWith: c.compatibleWith,
    version:        c.version,
    createdAt:      c.createdAt.toISOString(),
    updatedAt:      c.updatedAt.toISOString(),
  };
}

export class CreateComponent {
  constructor(
    private readonly componentRepo: ComponentRepository,
    private readonly clock:         Clock,
    private readonly idGenerator:   IdGenerator,
  ) {}

  async execute(input: CreateComponentInput): Promise<ComponentDto> {
    // Input validation.
    const errors: { field: string; reason: string }[] = [];
    if (!input.name?.trim()) errors.push({ field: 'name', reason: 'required' });
    if (typeof input.price !== 'number' || input.price < 0)
      errors.push({ field: 'price', reason: 'must be a non-negative integer (cents)' });
    if (errors.length > 0)
      throw new ValidationError('Invalid component data', errors);

    // SKU is derived from category/Type/dimensions. A numeric suffix
    // disambiguates the rare case of two components sharing the same specs
    // (e.g. a promo variant of an existing shelf).
    const baseSku = generateSku(input.category, input.Type, input.dimensions);
    let sku = baseSku;
    for (let suffix = 2; await this.componentRepo.findBySku(sku); suffix += 1) {
      sku = `${baseSku}-${suffix}`;
    }

    const now: Date = this.clock.now();
    const component: Component = {
      id:             this.idGenerator.generate(),
      sku,
      name:           input.name.trim(),
      description:    input.description?.trim() ?? '',
      category:       input.category,
      Type:           input.Type,
      price:          Math.floor(input.price),
      isAvailable:    input.isAvailable,
      imageUrl:       input.imageUrl?.trim() ?? '',
      dimensions:     input.dimensions,
      compatibleWith: input.compatibleWith ?? [],
      version:        1,
      createdAt:      now,
      updatedAt:      now,
    };

    await this.componentRepo.save(component);
    return toDto(component);
  }
}
