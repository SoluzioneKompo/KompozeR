import { resolveShelfRoles } from "../../src/domain/services/ShelfRoleResolver";

describe("ShelfRoleResolver", () => {
  it("marks every level of an isolated column as NORMALE", () => {
    const roles = resolveShelfRoles([{ levelsMm: [200, 400] }]);
    expect(roles.get(0)?.get(200)).toBe("NORMALE");
    expect(roles.get(0)?.get(400)).toBe("NORMALE");
  });

  it("marks both columns as BORDO when 2 adjacent columns share a level", () => {
    const roles = resolveShelfRoles([{ levelsMm: [300] }, { levelsMm: [300] }]);
    expect(roles.get(0)?.get(300)).toBe("BORDO");
    expect(roles.get(1)?.get(300)).toBe("BORDO");
  });

  it("marks BORDO, INTERMEDIO, BORDO when 3 adjacent columns share a level", () => {
    const roles = resolveShelfRoles([
      { levelsMm: [300] },
      { levelsMm: [300] },
      { levelsMm: [300] },
    ]);
    expect(roles.get(0)?.get(300)).toBe("BORDO");
    expect(roles.get(1)?.get(300)).toBe("INTERMEDIO");
    expect(roles.get(2)?.get(300)).toBe("BORDO");
  });

  it("marks BORDO on both ends and INTERMEDIO in between for 4+ adjacent columns", () => {
    const roles = resolveShelfRoles([
      { levelsMm: [300] },
      { levelsMm: [300] },
      { levelsMm: [300] },
      { levelsMm: [300] },
    ]);
    expect(roles.get(0)?.get(300)).toBe("BORDO");
    expect(roles.get(1)?.get(300)).toBe("INTERMEDIO");
    expect(roles.get(2)?.get(300)).toBe("INTERMEDIO");
    expect(roles.get(3)?.get(300)).toBe("BORDO");
  });

  it("treats columns sharing a level value but not adjacent by index as separate clusters", () => {
    // Column 1 does not have level 300, so columns 0 and 2 are not part of
    // the same cluster even though they share the same level value.
    const roles = resolveShelfRoles([
      { levelsMm: [300] },
      { levelsMm: [500] },
      { levelsMm: [300] },
    ]);
    expect(roles.get(0)?.get(300)).toBe("NORMALE");
    expect(roles.get(2)?.get(300)).toBe("NORMALE");
  });

  it("resolves roles independently per level within the same column", () => {
    const roles = resolveShelfRoles([
      { levelsMm: [200, 400] },
      { levelsMm: [400] },
    ]);
    // Level 200 is only present on column 0 -> NORMALE.
    expect(roles.get(0)?.get(200)).toBe("NORMALE");
    // Level 400 is shared by both adjacent columns -> BORDO.
    expect(roles.get(0)?.get(400)).toBe("BORDO");
    expect(roles.get(1)?.get(400)).toBe("BORDO");
  });

  it("returns an entry per column even when there are no levels at all", () => {
    const roles = resolveShelfRoles([{ levelsMm: [] }, { levelsMm: [] }]);
    expect(roles.get(0)?.size).toBe(0);
    expect(roles.get(1)?.size).toBe(0);
  });

  it("returns an empty map for an empty column set", () => {
    const roles = resolveShelfRoles([]);
    expect(roles.size).toBe(0);
  });
});
