import QRCode from "qrcode";
import { qrPayloadFor } from "./codegen";
import type { IssuedCode, Printer } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ticket ePOS-Print XML (Epson TM-m30III e compatibili). */
function eposXml(c: IssuedCode, title: string): string {
  const body = [
    `<text align="center"/>`,
    `<text width="2" height="2"/><text>${esc(title)}&#10;</text>`,
    `<text width="1" height="1"/><text>${esc(c.productName)}&#10;&#10;</text>`,
    `<symbol type="qrcode_model_2" level="level_m" width="7">${esc(qrPayloadFor(c.code))}</symbol>`,
    `<text>&#10;</text>`,
    `<text width="2" height="2"/><text>${esc(c.code)}&#10;</text>`,
    `<text width="1" height="1"/>`,
    c.stampTarget ? `<text>${esc(`1 / ${c.stampTarget}`)}${c.reward ? ` → ${esc(c.reward)}` : ""}&#10;</text>` : "",
    `<text>${new Date().toLocaleString()}&#10;</text>`,
    `<feed line="3"/><cut type="feed"/>`,
  ].join("");
  return `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">${body}</epos-print></s:Body></s:Envelope>`;
}

export function eposUrl(p: Printer): string {
  const scheme = p.secure === false ? "http" : "https";
  return `${scheme}://${p.host}/cgi-bin/epos/service.cgi?devid=${encodeURIComponent(p.deviceId || "local_printer")}&timeout=10000`;
}

async function printEpos(p: Printer, c: IssuedCode, title: string): Promise<void> {
  if (!p.host) throw new Error("PRINTER_NO_HOST");
  const res = await fetch(eposUrl(p), {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "If-Modified-Since": "Thu, 01 Jan 1970 00:00:00 GMT", SOAPAction: '""' },
    body: eposXml(c, title),
  });
  const txt = await res.text();
  if (!res.ok || !/success="true"/.test(txt)) {
    const m = /code="([^"]+)"/.exec(txt);
    throw new Error(m ? `PRINTER_${m[1]}` : `PRINTER_HTTP_${res.status}`);
  }
}

/** Stampa tramite la finestra di stampa del browser (qualsiasi stampante installata / AirPrint). */
async function printBrowser(c: IssuedCode, title: string): Promise<void> {
  const qr = await QRCode.toDataURL(qrPayloadFor(c.code), { margin: 1, width: 300, errorCorrectionLevel: "M" });
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) throw new Error("POPUP_BLOCKED");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.code)}</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;margin:0;padding:12px;width:72mm}h1{font-size:18px;margin:4px 0}h2{font-size:14px;margin:2px 0;font-weight:600}img{width:60mm;height:60mm}.code{font-size:30px;font-weight:900;letter-spacing:3px;font-family:monospace;margin:6px 0}small{color:#555}@media print{@page{margin:4mm}}</style></head>
<body><h1>${esc(title)}</h1><h2>${esc(c.productName)}</h2><img src="${qr}"><div class="code">${esc(c.code)}</div>
${c.stampTarget ? `<div>1 / ${c.stampTarget}${c.reward ? ` → ${esc(c.reward)}` : ""}</div>` : ""}<small>${new Date().toLocaleString()}</small>
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script></body></html>`);
  w.document.close();
}

export async function printCode(printer: Printer | undefined, c: IssuedCode, title: string): Promise<void> {
  if (!printer || printer.type === "browser") return printBrowser(c, title);
  return printEpos(printer, c, title);
}
