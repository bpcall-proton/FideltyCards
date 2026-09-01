import type { LoyaltyApi } from "../types";
import { LocalApi } from "./local";
import { FirebaseApi } from "./firebase";

const env = import.meta.env;
const apiKey = env.VITE_FIREBASE_API_KEY as string | undefined;
const projectId = env.VITE_FIREBASE_PROJECT_ID as string | undefined;

export const api: LoyaltyApi =
  apiKey && projectId
    ? new FirebaseApi(
        {
          apiKey,
          projectId,
          authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? `${projectId}.firebaseapp.com`,
          appId: env.VITE_FIREBASE_APP_ID as string | undefined,
        },
        (env.VITE_FIREBASE_REGION as string | undefined) ?? "europe-west1",
      )
    : new LocalApi();
