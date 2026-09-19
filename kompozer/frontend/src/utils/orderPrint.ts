/**
 * Builds and downloads a printable PDF for an order: configuration name,
 * full shelf assembly schema (with a measurement on every foot/upright/
 * terminal segment and the width of every shelf), BOM/items with pricing,
 * and shipping details.
 *
 * Reuses computeAssemblyGeometry — the same geometry CadView.vue renders
 * as an SVG — so the printed schema matches what the customer designed.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cadService } from '@/services/cadService';
import { computeAssemblyGeometry, type AssemblyPiece } from '@/utils/cadAssembly';
import { formatCurrencyFromCents } from '@/i18n/format';
import { i18n } from '@/i18n';
import type { ColumnDesign, ColumnPlan } from '@/types/cad';
import type { Order } from '@/types/order';

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 15;
const SCHEMA_HEIGHT_MM = 190;
/** Kompo brand accent (legno naturale) — see --color-admin-accent in tokens.css. */
const KOMPO_ACCENT: [number, number, number] = [138, 109, 79];

const PIECE_FILL: Record<AssemblyPiece['kind'], [number, number, number]> = {
  foot: [130, 130, 130],
  upright: [180, 180, 180],
  terminal: [90, 90, 90],
  shelf: [55, 65, 81],
};

function t(key: string): string {
  return i18n.global.t(key);
}

/** Formats a millimeter measurement as centimeters — mirrors CadView.vue's formatCm. */
function formatCm(valueMm: number): string {
  const cm = Math.round((valueMm / 10) * 10) / 10;
  return `${Number.isInteger(cm) ? cm : cm.toFixed(1)} cm`;
}

/** Draws an uppercase bold section title and leaves the font weight reset to normal. */
function drawSectionTitle(doc: jsPDF, text: string, x: number, y: number, fontSize = 14): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(0, 0, 0);
  doc.text(text.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
}

/** Draws a "Label: value" pair with a bold label followed by a normal-weight value. */
function drawField(doc: jsPDF, label: string, value: string, x: number, y: number): void {
  doc.setFont('helvetica', 'bold');
  doc.text(label, x, y);
  const labelWidth = doc.getTextWidth(`${label} `);
  doc.setFont('helvetica', 'normal');
  doc.text(value, x + labelWidth, y);
}

function drawSchemaPage(
  doc: jsPDF,
  title: string,
  columnPlan: ColumnPlan | null,
  columnDesigns: ColumnDesign[],
): void {
  const geometry = computeAssemblyGeometry(columnPlan, columnDesigns);

  drawSectionTitle(doc, title || 'Configuration', MARGIN_MM, MARGIN_MM, 16);

  const contentWidth = PAGE_WIDTH_MM - MARGIN_MM * 2;
  const contentTop = MARGIN_MM + 12;
  const scale =
    geometry.totalWidthMm > 0 && geometry.totalHeightMm > 0
      ? Math.min(contentWidth / geometry.totalWidthMm, SCHEMA_HEIGHT_MM / geometry.totalHeightMm)
      : 1;
  const drawWidth = geometry.totalWidthMm * scale;
  const offsetX = MARGIN_MM + (contentWidth - drawWidth) / 2;

  for (const piece of geometry.pieces) {
    const [r, g, b] = PIECE_FILL[piece.kind];
    const x = offsetX + piece.xMm * scale;
    const y = contentTop + (geometry.totalHeightMm - piece.topMm) * scale;
    const w = piece.widthMm * scale;
    const h = Math.max((piece.topMm - piece.bottomMm) * scale, 0.1);

    doc.setFillColor(r, g, b);
    doc.rect(x, y, w, h, 'F');

    doc.setFontSize(5);
    doc.setTextColor(0, 0, 0);
    if (piece.kind === 'shelf') {
      // Width of this shelf (piece.widthMm already equals the column's shelf width).
      doc.text(`L = ${formatCm(piece.widthMm)}`, x + w / 2, y - 1, { align: 'center' });
    } else {
      // Measurement of this foot/upright/terminal segment, next to the piece.
      doc.text(formatCm(piece.topMm - piece.bottomMm), x + w + 0.8, y + h / 2, { baseline: 'middle' });
    }
  }
}

function drawOrderPage(doc: jsPDF, order: Order, addPageBefore: boolean): void {
  if (addPageBefore) {
    doc.addPage();
  }

  let cursorY = MARGIN_MM;
  drawSectionTitle(doc, 'Distinta base e prezzi', MARGIN_MM, cursorY);
  cursorY += 6;

  const rows = order.items.map((item) => [
    item.name,
    String(item.quantity),
    formatCurrencyFromCents(item.unitPrice),
    formatCurrencyFromCents(item.unitPrice * item.quantity),
  ]);

  autoTable(doc, {
    startY: cursorY,
    head: [['Articolo', 'Qta', 'Prezzo unit.', 'Totale riga']],
    body: rows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: KOMPO_ACCENT, textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: MARGIN_MM, right: MARGIN_MM },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY + 20;

  const paidLabel = order.status === 'AWAITING_PAYMENT' ? 'Totale da pagare' : 'Totale pagato';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`${paidLabel}: ${formatCurrencyFromCents(order.total)}`, MARGIN_MM, finalY + 8);

  let shippingY = finalY + 20;
  if (shippingY > PAGE_HEIGHT_MM - MARGIN_MM - 45) {
    doc.addPage();
    shippingY = MARGIN_MM;
  }

  drawSectionTitle(doc, t('admin.orders.expedition.title'), MARGIN_MM, shippingY);
  shippingY += 8;

  doc.setFontSize(10);
  const info = order.expeditionInfo;
  if (!info) {
    doc.text('-', MARGIN_MM, shippingY);
    return;
  }

  const leftX = MARGIN_MM;
  const rightX = MARGIN_MM + (PAGE_WIDTH_MM - MARGIN_MM * 2) / 2;
  const rowsData: Array<[string, string, string, string]> = [
    [t('admin.orders.expedition.name'), `${info.name} ${info.surname}`, t('admin.orders.expedition.email'), info.mail],
    [t('admin.orders.expedition.phone'), info.phone, t('admin.orders.expedition.nation'), info.nation],
    [t('admin.orders.expedition.city'), info.city, t('admin.orders.expedition.cap'), info.cap],
  ];

  for (const [leftLabel, leftValue, rightLabel, rightValue] of rowsData) {
    drawField(doc, leftLabel, leftValue, leftX, shippingY);
    drawField(doc, rightLabel, rightValue, rightX, shippingY);
    shippingY += 6;
  }

  drawField(doc, t('admin.orders.expedition.address'), info.address, leftX, shippingY);
  shippingY += 6;

  if (info.deliveryNotes) {
    drawField(doc, t('admin.orders.expedition.deliveryNotes'), info.deliveryNotes, leftX, shippingY);
    shippingY += 6;
  }
}

/** Generates and triggers the download of the order PDF (schema + BOM + shipping). */
export async function printOrder(order: Order): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let hasSchemaPage = false;

  if (order.configId) {
    const config = await cadService.get(order.configId);
    drawSchemaPage(doc, order.configName ?? config.name, config.columnPlan, config.columnDesigns);
    hasSchemaPage = true;
  }

  drawOrderPage(doc, order, hasSchemaPage);

  doc.save(`ordine-${order.id}.pdf`);
}
