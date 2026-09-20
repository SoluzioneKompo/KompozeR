import {
  SHELF_THICKNESS_MM,
  buildSpines,
  buildStackedUprightSums,
  composeUprightBreakdown,
  computeNextLevelMm,
  deriveSpineBom,
  resolveFirstLevelHeightsMm,
  validateColumnCandidate,
  validateColumnDesigns,
  validateSpine,
} from "../../src/domain/services/SpineModel";

/**
 * Unit tests for spine geometry helpers used by design validation and BOM derivation.
 */
describe("SpineModel", () => {
  const rules = {
    footHeightsMm: [80, 180],
    uprightHeightsMm: [80],
    terminalHeightsMm: [40],
    maxHeightMm: 260,
  };

  it("uses the fixed shelf thickness when computing the next level", () => {
    expect(
      computeNextLevelMm({
        existingLevelsMm: [80],
        candidateHeightMm: 80,
      }),
    ).toBe(80 + SHELF_THICKNESS_MM + 80);
  });

  it("builds a shared interior spine from the merged levels of adjacent columns", () => {
    const spines = buildSpines([
      { levelsMm: [80] },
      { levelsMm: [180] },
    ]);

    expect(spines).toEqual([
      { index: 0, columnIndexes: [0], levelsMm: [80] },
      { index: 1, columnIndexes: [0, 1], levelsMm: [80, 180] },
      { index: 2, columnIndexes: [1], levelsMm: [180] },
    ]);
  });

  it("validates the shared spine example with exact fit segments", () => {
    expect(validateSpine([80, 180], rules)).toEqual({
      valid: true,
      terminalHeightMm: 40,
    });
  });

  it("rejects a candidate when the shared spine split is not an exact catalog upright", () => {
    expect(
      validateColumnCandidate(
        [
          { levelsMm: [80] },
          { levelsMm: [180] },
        ],
        0,
        60,
        rules,
      ),
    ).toMatchObject({
      valid: false,
      reasonCode: "INVALID_SEGMENT",
    });
  });

  it("derives BOM data per spine", () => {
    expect(deriveSpineBom([80, 180], rules)).toEqual({
      footHeightMm: 80,
      uprightHeightsMm: [80],
      terminalHeightMm: 40,
    });
  });

  it("blocks a candidate that shares a level with an adjacent column by default", () => {
    expect(
      validateColumnCandidate(
        [{ levelsMm: [] }, { levelsMm: [80] }],
        0,
        80,
        rules,
      ),
    ).toMatchObject({
      valid: false,
      reasonCode: "ADJACENCY_CONFLICT",
    });
  });

  it("allows a candidate sharing a level with an adjacent column when blockSharedLevel is false", () => {
    expect(
      validateColumnCandidate(
        [{ levelsMm: [] }, { levelsMm: [80] }],
        0,
        80,
        rules,
        { blockSharedLevel: false },
      ),
    ).toEqual({ valid: true });
  });

  it("still enforces other spine validations when blockSharedLevel is false", () => {
    expect(
      validateColumnCandidate(
        [{ levelsMm: [80] }, { levelsMm: [160] }],
        0,
        60,
        rules,
        { blockSharedLevel: false },
      ),
    ).toMatchObject({
      valid: false,
      reasonCode: "INVALID_SEGMENT",
    });
  });

  it("blocks a full design snapshot sharing a level between adjacent columns by default", () => {
    expect(
      validateColumnDesigns([{ levelsMm: [80] }, { levelsMm: [80] }], rules),
    ).toMatchObject({
      valid: false,
      reasonCode: "ADJACENCY_CONFLICT",
    });
  });

  it("allows a full design snapshot sharing a level when blockSharedLevel is false", () => {
    expect(
      validateColumnDesigns(
        [{ levelsMm: [80] }, { levelsMm: [80] }],
        rules,
        { blockSharedLevel: false },
      ),
    ).toEqual({ valid: true });
  });

  it("falls back to upright heights when the catalog has no feet", () => {
    const fallbackRules = {
      ...rules,
      footHeightsMm: [],
      uprightHeightsMm: [80, 180],
    };

    expect(resolveFirstLevelHeightsMm(fallbackRules)).toEqual([80, 180]);
    expect(validateSpine([80, 180], fallbackRules)).toEqual({
      valid: true,
      terminalHeightMm: 40,
    });
  });
});

/**
 * KUBE-specific: a segment between two shelves may be built from several
 * stacked catalog uprights (no shelf in between) instead of one exact piece.
 * Mirrors the boss's example: no single 600mm upright, but 2x300 (or 2x200+
 * 400) reaches it.
 */
describe("SpineModel — KUBE stacked uprights", () => {
  const kubeRules = {
    footHeightsMm: [80],
    uprightHeightsMm: [300, 400, 500],
    terminalHeightsMm: [40],
    maxHeightMm: 2000,
  };

  it("buildStackedUprightSums enumerates 2-piece sums, without duplicating single-piece values", () => {
    const sums = buildStackedUprightSums([200, 300, 400], 2);

    expect(sums.sort((a, b) => a - b)).toEqual([400, 500, 600, 700, 800]);
    // 300 and 400 are single catalog pieces already — not part of this family.
    expect(sums).not.toContain(300);
  });

  it("buildStackedUprightSums reaches sums only possible with 3 pieces when maxPieces allows it", () => {
    const twoPieceMax = new Set(buildStackedUprightSums([200, 300, 400], 2));
    const threePieceMax = new Set(buildStackedUprightSums([200, 300, 400], 3));

    // 900 = 300+300+300, unreachable with only 2 pieces (max 2x400=800).
    expect(twoPieceMax.has(900)).toBe(false);
    expect(threePieceMax.has(900)).toBe(true);
  });

  it("composeUprightBreakdown finds the minimum-piece combination for a gap with no exact catalog match", () => {
    const breakdown = composeUprightBreakdown(600, [200, 300, 400]);

    expect(breakdown).not.toBeNull();
    expect(breakdown!.length).toBe(2);
    expect(breakdown!.reduce((sum, heightMm) => sum + heightMm, 0)).toBe(600);
    for (const heightMm of breakdown!) {
      expect([200, 300, 400]).toContain(heightMm);
    }
  });

  it("composeUprightBreakdown returns null when no combination fits within maxPieces", () => {
    expect(composeUprightBreakdown(900, [200, 400], 2)).toBeNull();
  });

  it("validateSpine rejects a stacked-only segment by default (single-piece match required)", () => {
    // Segment between 80 and 700 is 700 - 80 - 20 = 600, not a single catalog upright
    // (only 300+300 reaches it).
    expect(validateSpine([80, 700], kubeRules)).toMatchObject({
      valid: false,
      reasonCode: "INVALID_SEGMENT",
    });
  });

  it("validateSpine accepts the same segment when allowStackedUprights is set", () => {
    expect(
      validateSpine([80, 700], kubeRules, undefined, { allowStackedUprights: true }),
    ).toEqual({ valid: true, terminalHeightMm: 40 });
  });

  it("validateColumnCandidate accepts a stacked-only gap end to end when allowStackedUprights is set", () => {
    expect(
      validateColumnCandidate([{ levelsMm: [80] }], 0, 600, kubeRules, { allowStackedUprights: true }),
    ).toEqual({ valid: true });

    expect(
      validateColumnCandidate([{ levelsMm: [80] }], 0, 600, kubeRules),
    ).toMatchObject({ valid: false, reasonCode: "INVALID_SEGMENT" });
  });

  it("deriveSpineBom keeps the raw segment gap (600mm) — piece decomposition is the BOM's job", () => {
    expect(
      deriveSpineBom([80, 700], kubeRules, undefined, { allowStackedUprights: true }),
    ).toEqual({
      footHeightMm: 80,
      uprightHeightsMm: [600],
      terminalHeightMm: 40,
    });
  });
});