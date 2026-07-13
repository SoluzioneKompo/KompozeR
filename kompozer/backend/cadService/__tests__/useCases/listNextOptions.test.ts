import { ListNextOptions } from '../../src/useCases/read/ListNextOptions';
import { buildCandidateGaps } from '../../src/domain/services/SpineModel';
import {
  FakeCatalogRulesProvider,
  FakeConfigurationRepository,
  buildConfiguration,
} from '../helpers/fakes';

/**
 * Tests for the "tall gap / bridge" feature in STANDARD logic.
 *
 * Scenario (user's request):
 *   - 3 columns; outer columns (0 and 2) are built densely,
 *   - the middle column (1) is left empty over a tall stretch,
 *   - at a certain height the middle column is bridged with a single shelf,
 *     supported by the shared montanti that the outer columns segment.
 *
 * Before the feature, ListNextOptions only offered feet (empty column) or a single
 * upright (non-empty), so the middle shelf could never span a gap taller than one
 * upright. Now neighbor-anchored candidates make the bridge expressible, while
 * validateColumnCandidate still enforces adjacency and shared-spine validity.
 */
describe('ListNextOptions — STANDARD tall-gap bridge', () => {
  const ENV = {
    maxWidthMm: 5000,
    maxHeightMm: 3000,
    minWidthMm: 600,
    minHeightMm: 220,
    unit: 'mm' as const,
  };

  // Default catalog fakes: uprights [120,300,400,500], feet [120,160], terminal [40].
  // Outer columns designed at [120, 440, 760] (foot 120, then +300, +300).
  const OUTER_LEVELS = [120, 440, 760];

  function seedThreeColumns() {
    const repo = new FakeConfigurationRepository();
    repo.seed(
      buildConfiguration({
        id: 'cfg_bridge',
        ownerId: 'usr_1',
        category: 'TONDO',
        status: 'DESIGN_IN_PROGRESS',
        environment: ENV,
        columnPlan: {
          columnCount: 3,
          columns: [
            { index: 0, shelfWidthMm: 800 },
            { index: 1, shelfWidthMm: 800 },
            { index: 2, shelfWidthMm: 800 },
          ],
        },
        columnDesigns: [
          { columnIndex: 0, shelfThicknessMm: 20, levelsMm: [...OUTER_LEVELS] },
          { columnIndex: 2, shelfThicknessMm: 20, levelsMm: [...OUTER_LEVELS] },
          // middle column (index 1) intentionally empty
        ],
      }),
    );
    return repo;
  }

  it('buildCandidateGaps includes neighbor-anchored gaps for an empty middle column', () => {
    const columnLevels = [
      { levelsMm: OUTER_LEVELS },
      { levelsMm: [] }, // middle empty
      { levelsMm: OUTER_LEVELS },
    ];

    const gaps = buildCandidateGaps(columnLevels, 1, {
      footHeightsMm: [120, 160],
      uprightHeightsMm: [120, 300],
    });
    const gapValues = gaps.map((g) => g.heightMm);

    // Base foot candidates are still present, classified as 'standard'.
    expect(gapValues).toContain(120);
    expect(gapValues).toContain(160);
    expect(gaps.find((g) => g.heightMm === 120)?.kind).toBe('standard');

    // Neighbor-anchored: joint 760 + thickness 20 + upright 120 = 900 (empty → gap === level).
    expect(gapValues).toContain(900);
    expect(gaps.find((g) => g.heightMm === 900)?.kind).toBe('bridge');
    // joint 440 + 20 + 300 = 760.
    expect(gapValues).toContain(760);
  });

  it('offers an allowed tall-gap option that bridges the empty middle column', async () => {
    const repo = seedThreeColumns();
    const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider());

    const result = await useCase.execute({ id: 'cfg_bridge', ownerId: 'usr_1', columnIndex: 1 });

    // A tall bridge at absolute level 900 must be present, allowed and flagged as 'bridge'.
    const bridge = result.options.find((o) => o.heightMm === 900);
    expect(bridge).toBeDefined();
    expect(bridge?.allowed).toBe(true);
    expect(bridge?.kind).toBe('bridge');
  });

  it('rejects a bridge that would land on the same level as a neighbor (adjacency)', async () => {
    const repo = seedThreeColumns();
    const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider());

    const result = await useCase.execute({ id: 'cfg_bridge', ownerId: 'usr_1', columnIndex: 1 });

    // A candidate that resolves to 760 (an existing neighbor level) must NOT be allowed.
    const conflicting = result.options.find((o) => o.heightMm === 760);
    if (conflicting) {
      expect(conflicting.allowed).toBe(false);
    }
  });

  it('still generates basic foot candidates for the empty middle column', async () => {
    const repo = seedThreeColumns();
    const useCase = new ListNextOptions(repo, new FakeCatalogRulesProvider());

    const result = await useCase.execute({ id: 'cfg_bridge', ownerId: 'usr_1', columnIndex: 1 });

    // Foot 120 is still offered as a candidate (base family), even though it is
    // correctly disallowed here: it collides with the outer columns' own foot at
    // 120mm (adjacency invariant on the shared spine).
    const foot = result.options.find((o) => o.heightMm === 120);
    expect(foot).toBeDefined();
    expect(foot?.allowed).toBe(false);
  });
});
