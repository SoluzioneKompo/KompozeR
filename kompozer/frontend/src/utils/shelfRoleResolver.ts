/**
 * Client-side mirror of the backend's ShelfRoleResolver
 * (kompozer/backend/cadService/src/domain/services/ShelfRoleResolver.ts), same
 * pattern as cadAssembly.ts mirroring SpineModel.buildSpines. Keep in sync.
 */
export type ShelfRole = 'NORMALE' | 'BORDO' | 'INTERMEDIO';

export interface ColumnLevelsForRole {
  readonly levelsMm: readonly number[];
}

/**
 * Resolves, for every (column, level) pair, whether the shelf at that level
 * is a plain shelf or an "intelligent" one (BORDO/INTERMEDIO). A shelf becomes
 * intelligent when its level is shared with one or more index-adjacent columns:
 * a cluster of 2 columns uses BORDO on both, a cluster of N>=3 uses BORDO on
 * the two ends and INTERMEDIO in between. A level not shared with any adjacent
 * column stays NORMALE.
 */
export function resolveShelfRoles(
  columnLevels: readonly ColumnLevelsForRole[],
): Map<number, Map<number, ShelfRole>> {
  const rolesByColumn = new Map<number, Map<number, ShelfRole>>();
  columnLevels.forEach((_, position) => rolesByColumn.set(position, new Map()));

  const positionsByLevel = new Map<number, number[]>();
  columnLevels.forEach((column, position) => {
    for (const levelMm of column.levelsMm) {
      const positions = positionsByLevel.get(levelMm) ?? [];
      positions.push(position);
      positionsByLevel.set(levelMm, positions);
    }
  });

  for (const [levelMm, positions] of positionsByLevel) {
    const sortedPositions = [...positions].sort((a, b) => a - b);

    let clusterStart = 0;
    for (let i = 1; i <= sortedPositions.length; i += 1) {
      const isBoundary = i === sortedPositions.length || sortedPositions[i] !== sortedPositions[i - 1] + 1;
      if (!isBoundary) {
        continue;
      }

      const cluster = sortedPositions.slice(clusterStart, i);
      assignClusterRoles(cluster, levelMm, rolesByColumn);
      clusterStart = i;
    }
  }

  return rolesByColumn;
}

function assignClusterRoles(
  cluster: readonly number[],
  levelMm: number,
  rolesByColumn: Map<number, Map<number, ShelfRole>>,
): void {
  if (cluster.length === 1) {
    rolesByColumn.get(cluster[0])?.set(levelMm, 'NORMALE');
    return;
  }

  cluster.forEach((position, index) => {
    const role: ShelfRole = index === 0 || index === cluster.length - 1 ? 'BORDO' : 'INTERMEDIO';
    rolesByColumn.get(position)?.set(levelMm, role);
  });
}
