/**
 * Exports the admin catalog as one file per category (TONDO/QUADRO/KUBE),
 * in JSON or CSV, triggering a separate browser download for each.
 */
import { catalogService } from '@/services/catalogService';
import type { Category } from '@/types/cad';
import type { CatalogItem } from '@/types/catalog';

export type CatalogExportFormat = 'json' | 'csv';

const EXPORT_CATEGORIES: readonly Category[] = ['TONDO', 'QUADRO', 'KUBE'];

const CSV_COLUMNS = [
  'sku',
  'name',
  'description',
  'category',
  'Type',
  'price',
  'isAvailable',
  'widthMm',
  'heightMm',
  'depthMm',
  'imageUrl',
  'compatibleWith',
  'version',
] as const;

/** Fetches every catalog item for one category, paging through the full result set. */
async function fetchAllItemsForCategory(category: Category): Promise<CatalogItem[]> {
  const allItems: CatalogItem[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await catalogService.list({ category, page, limit: 200 });
    allItems.push(...response.items);
    totalPages = response.totalPages;
    page += 1;
  } while (page <= totalPages);

  return allItems;
}

/** Quotes a CSV field only when needed, doubling any embedded quotes. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(items: CatalogItem[]): string {
  const rows = items.map((item) =>
    CSV_COLUMNS.map((column) => {
      if (column === 'widthMm' || column === 'heightMm' || column === 'depthMm') {
        return String(item.dimensions?.[column] ?? '');
      }
      if (column === 'compatibleWith') {
        return csvField((item.compatibleWith ?? []).join(';'));
      }
      return csvField(String(item[column] ?? ''));
    }).join(','),
  );

  return [CSV_COLUMNS.join(','), ...rows].join('\r\n');
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Downloads one file per category (TONDO/QUADRO/KUBE) in the requested format. */
export async function exportCatalogByCategory(format: CatalogExportFormat): Promise<void> {
  for (const category of EXPORT_CATEGORIES) {
    const items = await fetchAllItemsForCategory(category);

    if (format === 'csv') {
      downloadFile(`catalogo-${category}.csv`, toCsv(items), 'text/csv;charset=utf-8');
    } else {
      downloadFile(`catalogo-${category}.json`, JSON.stringify(items, null, 2), 'application/json;charset=utf-8');
    }
  }
}
