// The single import surface every route, action and engine call uses
// for persistence. Everything else imports from here, never directly
// from store/fileStore or store/firestoreStore, so the backend choice
// lives in exactly one place. Firestore is used automatically once a
// service account is present in the environment; otherwise the app
// falls back to the local file store with no setup required.

import { isFirestoreConfigured } from "@/lib/firestore/client";
import { firestoreStore } from "@/lib/store/firestoreStore";
import { fileStore } from "@/lib/store/fileStore";
import type { HisaabStore } from "@/lib/store/types";

export function getStore(): HisaabStore {
  return isFirestoreConfigured() ? firestoreStore : fileStore;
}
