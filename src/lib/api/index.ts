import type { LoyaltyApi } from "../types";
import { LocalApi } from "./local";
import { SupabaseApi } from "./supabase";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const api: LoyaltyApi = url && key ? new SupabaseApi(url, key) : new LocalApi();
