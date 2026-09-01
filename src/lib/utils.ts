import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtInt = (n: number) => n.toLocaleString("it-IT");
export const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString("it-IT") : "—");
export const fmtDateTime = (s?: string) => (s ? new Date(s).toLocaleString("it-IT") : "—");

export function deviceId(): string {
  const k = "fidelty-device-id";
  let v = localStorage.getItem(k);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(k, v);
  }
  return v;
}
