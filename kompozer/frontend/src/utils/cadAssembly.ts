/**
 * Derives a realistic 2D assembly drawing (feet, uprights, terminals, shelves)
 * purely from already-validated client-side data (columnPlan + columnDesigns).
 *
 * No backend call needed: every segment height here was already accepted by
 * the backend's SpineModel validation, so it necessarily matches a real
 * catalog piece height. Mirrors the backend's buildSpines shared-spine model
 * (kompozer/backend/cadService/src/domain/services/SpineModel.ts) so posts at
 * column boundaries are shared between adjacent columns, exactly like the
 * physical assembly.
 */
import type { ColumnDesign, ColumnPlan, TerminalSelection } from '@/types/cad';

export const SHELF_THICKNESS_MM = 20;
export const POST_WIDTH_MM = 40;
/** Fallback cap height when a spine has no terminal selection yet. */
export const TERMINAL_HEIGHT_MM = 40;

export type AssemblyPieceKind = 'foot' | 'upright' | 'terminal' | 'shelf';

export interface AssemblyPiece {
  kind: AssemblyPieceKind;
  xMm: number;
  widthMm: number;
  bottomMm: number;
  topMm: number;
}

export interface AssemblyGeometry {
  totalWidthMm: number;
  totalHeightMm: number;
  pieces: AssemblyPiece[];
  /** Center x (mm) and width (mm) per column, for labels below the drawing. */
  columnLabels: Array<{ index: number; centerXMm: number; widthMm: number; shelfWidthMm: number }>;
}

function resolveAdjacentPositions(spineIndex: number, columnCount: number): number[] {
  if (columnCount === 0) return [];
  if (spineIndex === 0) return [0];
  if (spineIndex === columnCount) return [columnCount - 1];
  return [spineIndex - 1, spineIndex];
}

function buildPostSegments(
  levelsMm: number[],
  terminalHeightMm: number,
): Array<{ kind: AssemblyPieceKind; bottomMm: number; topMm: number }> {
  if (levelsMm.length === 0) return [];

  const segments: Array<{ kind: AssemblyPieceKind; bottomMm: number; topMm: number }> = [
    { kind: 'foot', bottomMm: 0, topMm: levelsMm[0] },
  ];

  for (let i = 1; i < levelsMm.length; i += 1) {
    segments.push({
      kind: 'upright',
      bottomMm: levelsMm[i - 1] + SHELF_THICKNESS_MM,
      topMm: levelsMm[i],
    });
  }

  const capBottom = levelsMm[levelsMm.length - 1] + SHELF_THICKNESS_MM;
  segments.push({ kind: 'terminal', bottomMm: capBottom, topMm: capBottom + terminalHeightMm });

  return segments;
}

export function computeAssemblyGeometry(
  columnPlan: ColumnPlan | null | undefined,
  columnDesigns: ColumnDesign[] | undefined,
  terminalSelections: TerminalSelection[] | undefined = [],
): AssemblyGeometry {
  const terminalHeightBySpineIndex = new Map(
    terminalSelections.map((selection) => [selection.spineIndex, selection.heightMm]),
  );
  const columns = columnPlan?.columns ?? [];
  if (columns.length === 0) {
    return { totalWidthMm: 1, totalHeightMm: 1, pieces: [], columnLabels: [] };
  }

  const sortedColumns = [...columns].sort((a, b) => a.index - b.index);
  const columnCount = sortedColumns.length;
  const designByIndex = new Map((columnDesigns ?? []).map((design) => [design.columnIndex, design]));

  const columnLevelsByPosition: number[][] = sortedColumns.map((column) => {
    const design = designByIndex.get(column.index);
    return design ? [...design.levelsMm].sort((a, b) => a - b) : [];
  });

  // x layout: POST_WIDTH_MM at every one of the columnCount+1 spine positions,
  // with each column's own shelfWidthMm slotted between its flanking posts.
  let cursor = 0;
  const spineLeftX: number[] = [];
  const columnX: Array<{ left: number; right: number }> = [];
  for (let i = 0; i <= columnCount; i += 1) {
    spineLeftX.push(cursor);
    cursor += POST_WIDTH_MM;
    if (i < columnCount) {
      const left = cursor;
      cursor += sortedColumns[i].shelfWidthMm;
      columnX.push({ left, right: cursor });
    }
  }
  const totalWidthMm = cursor;

  const pieces: AssemblyPiece[] = [];
  let totalHeightMm = 1;

  for (let spineIndex = 0; spineIndex <= columnCount; spineIndex += 1) {
    const positions = resolveAdjacentPositions(spineIndex, columnCount);
    const merged = Array.from(new Set(positions.flatMap((position) => columnLevelsByPosition[position]))).sort(
      (a, b) => a - b,
    );
    const terminalHeightMm = terminalHeightBySpineIndex.get(spineIndex) ?? TERMINAL_HEIGHT_MM;
    const segments = buildPostSegments(merged, terminalHeightMm);
    const xLeft = spineLeftX[spineIndex];
    for (const segment of segments) {
      pieces.push({ kind: segment.kind, xMm: xLeft, widthMm: POST_WIDTH_MM, bottomMm: segment.bottomMm, topMm: segment.topMm });
      totalHeightMm = Math.max(totalHeightMm, segment.topMm);
    }
  }

  const columnLabels: AssemblyGeometry['columnLabels'] = [];
  sortedColumns.forEach((column, position) => {
    const levels = columnLevelsByPosition[position];
    const { left, right } = columnX[position];
    for (const level of levels) {
      pieces.push({ kind: 'shelf', xMm: left, widthMm: right - left, bottomMm: level, topMm: level + SHELF_THICKNESS_MM });
    }
    columnLabels.push({
      index: column.index,
      centerXMm: (left + right) / 2,
      widthMm: right - left,
      shelfWidthMm: column.shelfWidthMm,
    });
  });

  return { totalWidthMm, totalHeightMm, pieces, columnLabels };
}
