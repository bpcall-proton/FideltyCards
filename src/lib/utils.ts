import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { locale } from "./i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtInt = (n: number) => n.toLocaleString(locale());
export const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString(locale()) : "—");
export const fmtDateTime = (s?: string) => (s ? new Date(s).toLocaleString(locale()) : "—");

export function deviceId(): string {
  const k = "fidelty-device-id";
  let v = localStorage.getItem(k);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(k, v);
  }
  return v;
}
