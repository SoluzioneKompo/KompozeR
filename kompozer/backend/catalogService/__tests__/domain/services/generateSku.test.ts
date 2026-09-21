import { generateSku } from '../../../src/domain/services/generateSku';
import { ComponentCategory } from '../../../src/domain/entities/ComponentCategory';
import { ComponentType } from '../../../src/domain/entities/ComponentType';

describe('generateSku', () => {
  it('usa solo heightMm per componenti a singola dimensione (es. PIEDINO)', () => {
    const sku = generateSku(ComponentCategory.QUADRO, ComponentType.PIEDINO, {
      widthMm: 0,
      heightMm: 140,
      depthMm: 0,
    });
    expect(sku).toBe('QUADRO-SKU-PIEDINO-140');
  });

  it('usa widthMm x depthMm per componenti con footprint piano (es. RIPIANO)', () => {
    const sku = generateSku(ComponentCategory.TONDO, ComponentType.RIPIANO, {
      widthMm: 800,
      heightMm: 18,
      depthMm: 300,
    });
    expect(sku).toBe('TONDO-SKU-RIPIANO-800x300');
  });

  it('abbrevia RIPIANO_BORDO in BORDO, coerente con il catalogo QUADRO seedato', () => {
    const sku = generateSku(ComponentCategory.QUADRO, ComponentType.RIPIANO_BORDO, {
      widthMm: 200,
      heightMm: 18,
      depthMm: 200,
    });
    expect(sku).toBe('QUADRO-SKU-BORDO-200x200');
  });

  it('abbrevia RIPIANO_INTERMEDIO in INT, coerente con il catalogo QUADRO seedato', () => {
    const sku = generateSku(ComponentCategory.QUADRO, ComponentType.RIPIANO_INTERMEDIO, {
      widthMm: 500,
      heightMm: 18,
      depthMm: 200,
    });
    expect(sku).toBe('QUADRO-SKU-INT-500x200');
  });

  it('e deterministica: stesso input produce sempre lo stesso SKU', () => {
    const dims = { widthMm: 0, heightMm: 500, depthMm: 0 };
    const first = generateSku(ComponentCategory.QUADRO, ComponentType.MONTANTE, dims);
    const second = generateSku(ComponentCategory.QUADRO, ComponentType.MONTANTE, dims);
    expect(first).toBe(second);
  });
});
