import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { qrPayloadFor } from "./codegen";
import { codeStatusLabel, describeValue, type Code, type Lot } from "./types";
import { locale, t } from "./i18n";

const header = () => [t("thCode"), t("thValue"), t("thStatus"), t("thUsedAt")];
const file = (lot: Lot, suffix = "") => `${t("exLotPrefix")}-${lot.lotNumber}${suffix}`;

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function rows(lot: Lot, codes: Code[]) {
  const value = describeValue(lot);
  return codes.map((c) => [c.code, value, codeStatusLabel(c.status), c.usedAt ? new Date(c.usedAt).toLocaleString(locale()) : ""]);
}

export function exportCsv(lot: Lot, codes: Code[]) {
  const lines = [header(), ...rows(lot, codes)]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
  download(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `${file(lot)}.csv`);
}

export function exportExcel(lot: Lot, codes: Code[]) {
  const ws = XLSX.utils.aoa_to_sheet([header(), ...rows(lot, codes)]);
  ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${t("genLot")} ${lot.lotNumber}`);
  const info = XLSX.utils.aoa_to_sheet([
    [t("genLot"), lot.lotNumber], [t("exName"), lot.name], [t("thValue"), describeValue(lot)], [t("statCodes"), lot.totalCodes],
    [t("statUsed"), lot.usedCount], [t("statAvailable"), lot.availableCount], [t("statExpired"), lot.expiredCount],
    [t("exUsagePercent"), `${lot.usagePercent}%`], [t("genExpiry"), lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString(locale()) : t("exExpiryNone")],
  ]);
  XLSX.utils.book_append_sheet(wb, info, t("exSummary"));
  XLSX.writeFile(wb, `${file(lot)}.xlsx`);
}

/** Tabella stampabile dei codici numerici/alfanumerici. */
export function exportPdfTable(lot: Lot, codes: Code[]) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(`${t("LOT")} #${lot.lotNumber} — ${lot.name}`, 14, 16);
  doc.setFontSize(10);
  doc.text(`${t("thValue")}: ${describeValue(lot)}   ${t("statCodes")}: ${lot.totalCodes}   ${t("genExpiry")}: ${lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString(locale()) : t("none")}`, 14, 23);
  autoTable(doc, {
    startY: 28,
    head: [[t("thCode"), t("thValue"), t("thStatus")]],
    body: codes.map((c) => [c.code, describeValue(lot), codeStatusLabel(c.status)]),
    styles: { font: "courier", fontSize: 10 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  doc.save(`${file(lot, "-table")}.pdf`);
}

/** PDF pronto per la stampa: griglia di QR (con codice leggibile sotto) da ritagliare. */
export async function exportPdfQr(lot: Lot, codes: Code[], onProgress?: (done: number, total: number) => void) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cols = 4, rowsPerPage = 6, cell = 45, margin = 15, qrSize = 30;
  const showText = lot.codeFormat !== "qr";
  let i = 0;
  for (const c of codes) {
    const idx = i % (cols * rowsPerPage);
    if (i > 0 && idx === 0) doc.addPage();
    if (idx === 0) {
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`${t("genLot")} #${lot.lotNumber} · ${lot.name} · ${describeValue(lot)}`, margin, 10);
      doc.setTextColor(0);
    }
    const x = margin + (idx % cols) * cell;
    const y = margin + Math.floor(idx / cols) * cell;
    const dataUrl = await QRCode.toDataURL(qrPayloadFor(c.code), { margin: 1, width: 256, errorCorrectionLevel: "M" });
    doc.addImage(dataUrl, "PNG", x + (cell - qrSize) / 2, y, qrSize, qrSize);
    if (showText) {
      doc.setFont("courier", "bold");
      doc.setFontSize(12);
      doc.text(c.code, x + cell / 2, y + qrSize + 5, { align: "center" });
      doc.setFont("helvetica", "normal");
    }
    doc.setFontSize(7);
    doc.text(describeValue(lot), x + cell / 2, y + qrSize + 9, { align: "center" });
    doc.setDrawColor(200);
    doc.rect(x, y - 2, cell, cell - 2);
    i++;
    if (onProgress && i % 50 === 0) {
      onProgress(i, codes.length);
      await new Promise((r) => setTimeout(r));
    }
  }
  doc.save(`${file(lot, "-qr")}.pdf`);
}
