import {
  assertStep4LogicImplemented,
  resolveStep4LogicFamily,
} from "../../src/domain/services/Step4LogicResolver";

describe("Step4LogicResolver", () => {
  it("resolves TONDO to the STANDARD family", () => {
    expect(resolveStep4LogicFamily("TONDO")).toBe("STANDARD");
  });

  it("resolves QUADRO to its own QUADRO family", () => {
    expect(resolveStep4LogicFamily("QUADRO")).toBe("QUADRO");
  });

  it("resolves KUBE to the KUBE family", () => {
    expect(resolveStep4LogicFamily("KUBE")).toBe("KUBE");
  });

  it("does not throw for TONDO", () => {
    expect(() => assertStep4LogicImplemented("TONDO")).not.toThrow();
  });

  it("does not throw for QUADRO", () => {
    expect(() => assertStep4LogicImplemented("QUADRO")).not.toThrow();
  });

  it("does not throw for KUBE", () => {
    expect(() => assertStep4LogicImplemented("KUBE")).not.toThrow();
  });
});
