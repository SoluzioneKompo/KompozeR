import { Configuration } from '../../src/domain/entities/Configuration';
import { BomItem } from '../../src/domain/entities/Bom';
import {
  CatalogRules,
  CatalogRulesProvider,
} from '../../src/domain/ports/CatalogRulesProvider';
import { CartServiceClient } from '../../src/domain/ports/CartServiceClient';
import { NotificationSubscriptionClient } from '../../src/domain/ports/NotificationSubscriptionClient';
import { ConfigurationRepository } from '../../src/domain/ports/ConfigurationRepository';

/** In-memory repository fake used by CAD unit tests. */
export class FakeConfigurationRepository implements ConfigurationRepository {
  private readonly store = new Map<string, Configuration>();

  async save(configuration: Configuration): Promise<void> {
    this.store.set(configuration.id, this.clone(configuration));
  }

  async findById(id: string): Promise<Configuration | null> {
    const configuration = this.store.get(id);
    return configuration ? this.clone(configuration) : null;
  }

  async findByOwner(ownerId: string): Promise<Configuration[]> {
    return [...this.store.values()]
      .filter((configuration) => configuration.ownerId === ownerId)
      .map((configuration) => this.clone(configuration));
  }

  async findAccessibleByUser(userId: string): Promise<Configuration[]> {
    return [...this.store.values()]
      .filter((configuration) =>
        configuration.ownerId === userId || configuration.collaborators.includes(userId),
      )
      .map((configuration) => this.clone(configuration));
  }

  async addCollaborator(id: string, userId: string): Promise<void> {
    const existing = this.store.get(id);
    if (!existing) {
      return;
    }

    if (existing.ownerId === userId) {
      return;
    }

    existing.collaborators = Array.from(new Set([...existing.collaborators, userId]));
    this.store.set(id, this.clone(existing));
  }

  async update(configuration: Configuration): Promise<void> {
    this.store.set(configuration.id, this.clone(configuration));
  }

  seed(configuration: Configuration): void {
    this.store.set(configuration.id, this.clone(configuration));
  }

  private clone(configuration: Configuration): Configuration {
    return {
      ...configuration,
      collaborators: [...configuration.collaborators],
      environment: configuration.environment ? { ...configuration.environment } : null,
      columnPlan: configuration.columnPlan
        ? {
            ...configuration.columnPlan,
            columns: configuration.columnPlan.columns.map((column) => ({ ...column })),
          }
        : null,
      columnDesigns: configuration.columnDesigns.map((design) => ({
        ...design,
        levelsMm: [...design.levelsMm],
      })),
      components: configuration.components.map((comp) => ({ ...comp })),
      createdAt: new Date(configuration.createdAt),
      updatedAt: new Date(configuration.updatedAt),
    };
  }
}

/** Builds a baseline configuration aggregate for test scenarios. */
export function buildConfiguration(overrides: Partial<Configuration> = {}): Configuration {
  const now = new Date('2026-06-10T10:00:00.000Z');
  return {
    id: 'cfg_test',
    ownerId: 'usr_1',
    collaborators: [],
    name: 'Configurazione test',
    status: 'DRAFT',
    category: null,
    environment: null,
    columnPlan: null,
    columnDesigns: [],
    components: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Catalog-rules provider fake returning deterministic in-memory rules. */
export class FakeCatalogRulesProvider implements CatalogRulesProvider {
  constructor(private readonly rules: CatalogRules = buildCatalogRules()) {}

  async getRules(): Promise<CatalogRules> {
    return {
      shelfByWidthMm: new Map(this.rules.shelfByWidthMm),
      bordoByWidthMm: new Map(this.rules.bordoByWidthMm),
      intermezzoByWidthMm: new Map(this.rules.intermezzoByWidthMm),
      uprightByHeightMm: new Map(this.rules.uprightByHeightMm),
      footByHeightMm: new Map(this.rules.footByHeightMm),
      terminalHeightsMm: [...this.rules.terminalHeightsMm],
      footHeightsMm: [...this.rules.footHeightsMm],
      uprightHeightsMm: [...this.rules.uprightHeightsMm],
      defaultFoot: this.rules.defaultFoot,
      defaultTerminal: this.rules.defaultTerminal,
    };
  }
}

/** Cart client fake collecting push calls for assertions. */
export class FakeCartServiceClient implements CartServiceClient {
  readonly calls: Array<{ ownerId: string; items: BomItem[] }> = [];

  async pushBomToCart(ownerId: string, items: BomItem[]): Promise<void> {
    this.calls.push({ ownerId, items: [...items] });
  }
}

/** Notification client fake collecting subscription calls for assertions. */
export class FakeNotificationSubscriptionClient implements NotificationSubscriptionClient {
  readonly calls: Array<{ ownerId: string; sku: string }> = [];

  async ensureProductAvailabilitySubscription(ownerId: string, sku: string): Promise<void> {
    this.calls.push({ ownerId, sku });
  }
}

/** Builds default catalog rules and allows selective overrides for tests. */
export function buildCatalogRules(overrides: Partial<CatalogRules> = {}): CatalogRules {
  const shelfMap = new Map([
    [600,  { type: 'RIPIANO' as const, sku: 'RIP-600', name: 'Ripiano 600', priceCents: 2990, widthMm: 600,  heightMm: 20, depthMm: 300 }],
    [800,  { type: 'RIPIANO' as const, sku: 'RIP-800', name: 'Ripiano 800', priceCents: 3490, widthMm: 800,  heightMm: 20, depthMm: 300 }],
    [1000, { type: 'RIPIANO' as const, sku: 'RIP-1000', name: 'Ripiano 1000', priceCents: 3990, widthMm: 1000, heightMm: 20, depthMm: 300 }],
  ]);

  const uprightMap = new Map([
    [120, { type: 'MONTANTE' as const, sku: 'MON-120', name: 'Montante 120', priceCents: 990, widthMm: 40, heightMm: 120, depthMm: 40 }],
    [300, { type: 'MONTANTE' as const, sku: 'MON-300', name: 'Montante 300', priceCents: 1490, widthMm: 40, heightMm: 300, depthMm: 40 }],
    [400, { type: 'MONTANTE' as const, sku: 'MON-400', name: 'Montante 400', priceCents: 1790, widthMm: 40, heightMm: 400, depthMm: 40 }],
    [500, { type: 'MONTANTE' as const, sku: 'MON-500', name: 'Montante 500', priceCents: 1990, widthMm: 40, heightMm: 500, depthMm: 40 }],
  ]);

  const defaultFoot = { type: 'PIEDINO' as const, sku: 'PIE-120', name: 'Piedino 120', priceCents: 490, widthMm: 40, heightMm: 120, depthMm: 40 };
  const altFoot = { type: 'PIEDINO' as const, sku: 'PIE-160', name: 'Piedino 160', priceCents: 590, widthMm: 40, heightMm: 160, depthMm: 40 };
  const defaultTerminal = { type: 'TERMINALE' as const, sku: 'TER-40', name: 'Terminale 40', priceCents: 390, widthMm: 40, heightMm: 40, depthMm: 40 };
  const footMap = new Map([
    [120, defaultFoot],
    [160, altFoot],
  ]);

  const base: CatalogRules = {
    shelfByWidthMm: shelfMap,
    bordoByWidthMm: new Map(),
    intermezzoByWidthMm: new Map(),
    uprightByHeightMm: uprightMap,
    footByHeightMm: footMap,
    terminalHeightsMm: [40],
    footHeightsMm: [120, 160],
    uprightHeightsMm: [120, 300, 400, 500],
    defaultFoot,
    defaultTerminal,
  };

  return {
    shelfByWidthMm:      overrides.shelfByWidthMm      ? new Map(overrides.shelfByWidthMm)      : base.shelfByWidthMm,
    bordoByWidthMm:      overrides.bordoByWidthMm      ? new Map(overrides.bordoByWidthMm)      : base.bordoByWidthMm,
    intermezzoByWidthMm: overrides.intermezzoByWidthMm ? new Map(overrides.intermezzoByWidthMm) : base.intermezzoByWidthMm,
    uprightByHeightMm:   overrides.uprightByHeightMm   ? new Map(overrides.uprightByHeightMm)   : base.uprightByHeightMm,
    footByHeightMm:      overrides.footByHeightMm      ? new Map(overrides.footByHeightMm)      : base.footByHeightMm,
    terminalHeightsMm:   overrides.terminalHeightsMm   ?? base.terminalHeightsMm,
    footHeightsMm:       overrides.footHeightsMm       ?? base.footHeightsMm,
    uprightHeightsMm:    overrides.uprightHeightsMm    ?? base.uprightHeightsMm,
    defaultFoot:         overrides.defaultFoot         ?? base.defaultFoot,
    defaultTerminal:     overrides.defaultTerminal     ?? base.defaultTerminal,
  };
}