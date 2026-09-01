import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { qrPayloadFor } from "./codegen";
import { describeValue, type Code, type Lot } from "./types";

const STATUS_IT: Record<Code["status"], string> = {
  ACTIVE: "Disponibile", USED: "Utilizzato", EXPIRED: "Scaduto", CANCELLED: "Annullato",
};

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function rows(lot: Lot, codes: Code[]) {
  const value = describeValue(lot);
  return codes.map((c) => [c.code, value, STATUS_IT[c.status], c.usedAt ? new Date(c.usedAt).toLocaleString("it-IT") : ""]);
}

export function exportCsv(lot: Lot, codes: Code[]) {
  const lines = [["Codice", "Valore", "Stato", "Utilizzato il"], ...rows(lot, codes)]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
  download(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `lotto-${lot.lotNumber}.csv`);
}

export function exportExcel(lot: Lot, codes: Code[]) {
  const ws = XLSX.utils.aoa_to_sheet([["Codice", "Valore", "Stato", "Utilizzato il"], ...rows(lot, codes)]);
  ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Lotto ${lot.lotNumber}`);
  const info = XLSX.utils.aoa_to_sheet([
    ["Lotto", lot.lotNumber], ["Nome", lot.name], ["Valore", describeValue(lot)], ["Codici", lot.totalCodes],
    ["Utilizzati", lot.usedCount], ["Disponibili", lot.availableCount], ["Scaduti", lot.expiredCount],
    ["Percentuale utilizzo", `${lot.usagePercent}%`], ["Scadenza", lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString("it-IT") : "Nessuna"],
  ]);
  XLSX.utils.book_append_sheet(wb, info, "Riepilogo");
  XLSX.writeFile(wb, `lotto-${lot.lotNumber}.xlsx`);
}

/** Tabella stampabile dei codici numerici/alfanumerici. */
export function exportPdfTable(lot: Lot, codes: Code[]) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(`LOTTO #${lot.lotNumber} — ${lot.name}`, 14, 16);
  doc.setFontSize(10);
  doc.text(`Valore: ${describeValue(lot)}   Codici: ${lot.totalCodes}   Scadenza: ${lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString("it-IT") : "nessuna"}`, 14, 23);
  autoTable(doc, {
    startY: 28,
    head: [["Codice", "Valore", "Stato"]],
    body: codes.map((c) => [c.code, describeValue(lot), STATUS_IT[c.status]]),
    styles: { font: "courier", fontSize: 10 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  doc.save(`lotto-${lot.lotNumber}-tabella.pdf`);
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
      doc.text(`Lotto #${lot.lotNumber} · ${lot.name} · ${describeValue(lot)}`, margin, 10);
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
  doc.save(`lotto-${lot.lotNumber}-qr.pdf`);
}
