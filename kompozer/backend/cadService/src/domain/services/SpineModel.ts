export const SHELF_THICKNESS_MM = 20;
export const SPINE_COMPONENT_MULTIPLIER = 2;

export type SpineReasonCode =
  | "ADJACENCY_CONFLICT"
  | "INVALID_FIRST_LEVEL"
  | "INVALID_SEGMENT"
  | "MAX_HEIGHT_EXCEEDED"
  | "NO_TERMINAL_FIT";

export interface SpineRules {
  footHeightsMm: readonly number[];
  uprightHeightsMm: readonly number[];
  terminalHeightsMm: readonly number[];
  maxHeightMm: number;
}

export interface ColumnLevels {
  levelsMm: readonly number[];
}

export interface SpineModel {
  index: number;
  columnIndexes: readonly number[];
  levelsMm: readonly number[];
}

export interface SpineValidationResult {
  valid: boolean;
  reasonCode?: SpineReasonCode;
  reason?: string;
  terminalHeightMm?: number;
}

export interface NextLevelInput {
  existingLevelsMm: readonly number[];
  candidateHeightMm: number;
}

export interface SpineBom {
  footHeightMm: number;
  uprightHeightsMm: readonly number[];
  terminalHeightMm: number;
}

export function resolveFirstLevelHeightsMm(rules: Pick<SpineRules, 'footHeightsMm' | 'uprightHeightsMm'>): readonly number[] {
  return rules.footHeightsMm.length > 0 ? rules.footHeightsMm : rules.uprightHeightsMm;
}

export interface ColumnSpineValidationResult {
  valid: boolean;
  spineIndex?: number;
  reasonCode?: SpineReasonCode;
  reason?: string;
}

export function computeNextLevelMm(input: NextLevelInput): number {
  const sortedLevels = sortLevels(input.existingLevelsMm);
  if (sortedLevels.length === 0) {
    return input.candidateHeightMm;
  }

  return sortedLevels[sortedLevels.length - 1] + SHELF_THICKNESS_MM + input.candidateHeightMm;
}

/**
 * Distinguishes how a candidate gap is supported:
 * - 'standard': a single foot/upright placed directly on the column's own stack;
 * - 'bridge':   the shelf attaches one upright above a joint provided by an adjacent
 *               column, spanning a tall gap held by the neighbors' shared montante.
 */
export type CandidateGapKind = 'standard' | 'bridge';

export interface CandidateGap {
  heightMm: number;
  kind: CandidateGapKind;
}

/**
 * Builds the set of candidate gap heights for the next shelf of a target column.
 *
 * Two families of candidates are produced:
 * 1. Base single-piece gaps ('standard'): a foot (empty column) or a single upright
 *    (non-empty), i.e. the classic bottom-up construction where the column supports itself.
 * 2. Neighbor-anchored gaps ('bridge'): a shelf may attach one upright above ANY joint
 *    provided by an adjacent column. Because adjacent columns share the vertical montante,
 *    the neighbors segment that montante — so a column can legitimately span a gap taller
 *    than any single available upright (e.g. an empty middle column bridged high up).
 *
 * When a gap value belongs to both families the 'standard' classification wins (it is a
 * genuine single piece). Every returned gap is only a *candidate*: geometric/adjacency
 * validity is still enforced downstream by `validateColumnCandidate`.
 *
 * Gaps are expressed in the same units consumed by `computeNextLevelMm`:
 * - empty column: gap === absolute first level,
 * - non-empty column: gap === absoluteLevel - currentTop - shelfThickness.
 */
export function buildCandidateGaps(
  columnLevels: readonly ColumnLevels[],
  columnIndex: number,
  rules: Pick<SpineRules, 'footHeightsMm' | 'uprightHeightsMm'>,
): CandidateGap[] {
  const uprights = rules.uprightHeightsMm;
  const feet = resolveFirstLevelHeightsMm(rules);
  const levels = sortLevels(columnLevels[columnIndex]?.levelsMm ?? []);
  const isEmpty = levels.length === 0;
  const top = isEmpty ? 0 : levels[levels.length - 1];

  const byGap = new Map<number, CandidateGapKind>();

  // Family 1: base single-piece candidates (classic bottom-up construction).
  if (isEmpty) {
    for (const foot of feet) {
      byGap.set(foot, 'standard');
    }
  } else {
    for (const upright of uprights) {
      byGap.set(upright, 'standard');
    }
  }

  // Family 2: neighbor-anchored candidates. Collect joints from adjacent columns
  // strictly above the target column's current top; a shelf may sit one upright
  // above each such joint, spanning a tall empty gap held by the neighbors.
  const neighborJoints = new Set<number>();
  for (const neighborIndex of [columnIndex - 1, columnIndex + 1]) {
    for (const level of columnLevels[neighborIndex]?.levelsMm ?? []) {
      if (level > top) {
        neighborJoints.add(level);
      }
    }
  }

  for (const joint of neighborJoints) {
    for (const upright of uprights) {
      const absoluteLevel = joint + SHELF_THICKNESS_MM + upright;
      const gap = isEmpty ? absoluteLevel : absoluteLevel - top - SHELF_THICKNESS_MM;
      // Do not downgrade a real single-piece candidate to a bridge.
      if (gap > 0 && !byGap.has(gap)) {
        byGap.set(gap, 'bridge');
      }
    }
  }

  return [...byGap.entries()]
    .map(([heightMm, kind]) => ({ heightMm, kind }))
    .sort((a, b) => a.heightMm - b.heightMm);
}



export function buildSpines(columnLevels: readonly ColumnLevels[]): SpineModel[] {
  const spines: SpineModel[] = [];

  for (let spineIndex = 0; spineIndex <= columnLevels.length; spineIndex += 1) {
    const columnIndexes = resolveAdjacentColumnIndexes(spineIndex, columnLevels.length);
    const levelsMm = sortLevels(
      columnIndexes.flatMap((columnIndex) => columnLevels[columnIndex]?.levelsMm ?? []),
    );

    spines.push({
      index: spineIndex,
      columnIndexes,
      levelsMm,
    });
  }

  return spines;
}

export function validateSpine(levelsMm: readonly number[], rules: SpineRules): SpineValidationResult {
  const sortedLevels = sortLevels(levelsMm);
  if (sortedLevels.length === 0) {
    return { valid: true };
  }

  const firstLevelHeightsMm = resolveFirstLevelHeightsMm(rules);

  if (!firstLevelHeightsMm.includes(sortedLevels[0])) {
    return {
      valid: false,
      reasonCode: "INVALID_FIRST_LEVEL",
      reason: `First level ${sortedLevels[0]}mm is not a valid foot height`,
    };
  }

  for (let index = 1; index < sortedLevels.length; index += 1) {
    const previousLevel = sortedLevels[index - 1];
    const currentLevel = sortedLevels[index];
    const segmentHeight = currentLevel - previousLevel - SHELF_THICKNESS_MM;

    if (!rules.uprightHeightsMm.includes(segmentHeight)) {
      return {
        valid: false,
        reasonCode: "INVALID_SEGMENT",
        reason: `Segment ${segmentHeight}mm between ${previousLevel}mm and ${currentLevel}mm is not a valid upright height`,
      };
    }
  }

  const terminalHeightMm = pickTerminalHeight(sortedLevels[sortedLevels.length - 1], rules);
  if (terminalHeightMm == null) {
    return {
      valid: false,
      reasonCode: "NO_TERMINAL_FIT",
      reason: `No terminal fits above ${sortedLevels[sortedLevels.length - 1]}mm`,
    };
  }

  if (sortedLevels[sortedLevels.length - 1] + SHELF_THICKNESS_MM + terminalHeightMm > rules.maxHeightMm) {
    return {
      valid: false,
      reasonCode: "MAX_HEIGHT_EXCEEDED",
      reason: `Max height ${rules.maxHeightMm}mm exceeded`,
    };
  }

  return {
    valid: true,
    terminalHeightMm,
  };
}

export function validateColumnCandidate(
  columnLevels: readonly ColumnLevels[],
  columnIndex: number,
  candidateHeightMm: number,
  rules: SpineRules,
): SpineValidationResult {
  const targetColumn = columnLevels[columnIndex];
  if (!targetColumn) {
    return {
      valid: false,
      reasonCode: "INVALID_FIRST_LEVEL",
      reason: `Column ${columnIndex} does not exist`,
    };
  }

  const nextLevelMm = computeNextLevelMm({
    existingLevelsMm: targetColumn.levelsMm,
    candidateHeightMm,
  });

  const leftNeighbor = columnLevels[columnIndex - 1];
  if (leftNeighbor?.levelsMm.includes(nextLevelMm)) {
    return {
      valid: false,
      reasonCode: "ADJACENCY_CONFLICT",
      reason: `Adjacent column level conflict at ${nextLevelMm}mm`,
    };
  }

  const rightNeighbor = columnLevels[columnIndex + 1];
  if (rightNeighbor?.levelsMm.includes(nextLevelMm)) {
    return {
      valid: false,
      reasonCode: "ADJACENCY_CONFLICT",
      reason: `Adjacent column level conflict at ${nextLevelMm}mm`,
    };
  }

  const nextColumns = columnLevels.map((column, currentIndex) => {
    if (currentIndex !== columnIndex) {
      return column;
    }

    return {
      levelsMm: [...column.levelsMm, nextLevelMm],
    };
  });

  const affectedSpineIndexes = new Set<number>([columnIndex, columnIndex + 1]);
  const spines = buildSpines(nextColumns);

  for (const spine of spines) {
    if (!affectedSpineIndexes.has(spine.index)) {
      continue;
    }

    const validation = validateSpine(spine.levelsMm, rules);
    if (!validation.valid) {
      return validation;
    }
  }

  return { valid: true };
}

export function validateColumnDesigns(
  columnLevels: readonly ColumnLevels[],
  rules: SpineRules,
): ColumnSpineValidationResult {
  for (let index = 0; index < columnLevels.length - 1; index += 1) {
    const leftLevels = new Set(columnLevels[index]?.levelsMm ?? []);
    const rightLevels = columnLevels[index + 1]?.levelsMm ?? [];

    for (const levelMm of rightLevels) {
      if (leftLevels.has(levelMm)) {
        return {
          valid: false,
          spineIndex: index + 1,
          reasonCode: "ADJACENCY_CONFLICT",
          reason: `Adjacent columns cannot share the same level ${levelMm}mm`,
        };
      }
    }
  }

  const spines = buildSpines(columnLevels);

  for (const spine of spines) {
    const validation = validateSpine(spine.levelsMm, rules);
    if (!validation.valid) {
      return {
        valid: false,
        spineIndex: spine.index,
        reasonCode: validation.reasonCode,
        reason: validation.reason,
      };
    }
  }

  return { valid: true };
}

export function deriveSpineBom(levelsMm: readonly number[], rules: SpineRules): SpineBom | null {
  const validation = validateSpine(levelsMm, rules);
  if (!validation.valid || validation.terminalHeightMm == null) {
    return null;
  }

  const sortedLevels = sortLevels(levelsMm);
  if (sortedLevels.length === 0) {
    return null;
  }

  return {
    footHeightMm: sortedLevels[0],
    uprightHeightsMm: sortedLevels.slice(1).map((levelMm, index) => {
      return levelMm - sortedLevels[index] - SHELF_THICKNESS_MM;
    }),
    terminalHeightMm: validation.terminalHeightMm,
  };
}

function pickTerminalHeight(topLevelMm: number, rules: SpineRules): number | null {
  const sortedTerminalHeights = [...rules.terminalHeightsMm].sort((left, right) => left - right);

  for (const terminalHeightMm of sortedTerminalHeights) {
    if (topLevelMm + SHELF_THICKNESS_MM + terminalHeightMm <= rules.maxHeightMm) {
      return terminalHeightMm;
    }
  }

  return null;
}

function resolveAdjacentColumnIndexes(spineIndex: number, columnCount: number): number[] {
  if (columnCount === 0) {
    return [];
  }

  if (spineIndex === 0) {
    return [0];
  }

  if (spineIndex === columnCount) {
    return [columnCount - 1];
  }

  return [spineIndex - 1, spineIndex];
}

function sortLevels(levelsMm: readonly number[]): number[] {
  return [...new Set(levelsMm)].sort((left, right) => left - right);
}