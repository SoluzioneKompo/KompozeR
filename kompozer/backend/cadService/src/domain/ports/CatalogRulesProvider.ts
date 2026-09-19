import { Category } from '../entities/Category';

export type CatalogComponentType = 'PIEDINO' | 'MONTANTE' | 'RIPIANO' | 'TERMINALE' | 'MENSOLA' | 'RIPIANO_BORDO' | 'RIPIANO_INTERMEDIO';

export interface CatalogComponentRule {
  type: CatalogComponentType;
  sku: string;
  name: string;
  priceCents: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export interface CatalogRules {
  shelfByWidthMm: Map<number, CatalogComponentRule>;
  /** BORDO shelf (2+ adjacent columns sharing a level, outer position) keyed by widthMm (QUADRO) */
  bordoByWidthMm: Map<number, CatalogComponentRule>;
  /** INTERMEDIO shelf (3+ adjacent columns sharing a level, inner position) keyed by widthMm (QUADRO) */
  intermezzoByWidthMm: Map<number, CatalogComponentRule>;
  /** Smallest upright whose heightMm >= requested gap; keyed by exact heightMm */
  uprightByHeightMm: Map<number, CatalogComponentRule>;
  /** Foot rule keyed by exact heightMm */
  footByHeightMm: Map<number, CatalogComponentRule>;
  /** Terminal rule keyed by exact heightMm */
  terminalByHeightMm: Map<number, CatalogComponentRule>;
  terminalHeightsMm: number[];
  footHeightsMm: number[];
  uprightHeightsMm: number[];
  /** First available foot rule (lowest height) */
  defaultFoot: CatalogComponentRule | null;
  /** First available terminal rule */
  defaultTerminal: CatalogComponentRule | null;
}

/** Read-only contract for resolving catalog rules required by CAD validation and BOM logic. */
export interface CatalogRulesProvider {
  getRules(category: Category): Promise<CatalogRules>;
}
