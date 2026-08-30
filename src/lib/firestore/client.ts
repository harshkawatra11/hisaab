// Firestore Admin client, the production persistence path. Configured
// with a service account scoped to exactly one IAM role,
// roles/datastore.user, on a dedicated GCP project, the same pattern
// Adhikaar uses: that account cannot touch billing, cannot create
// resources, cannot read anything outside this Firestore database.
//
// Cost containment is layered, not a single promise: the Firestore
// database sits on the perpetual free tier (50,000 reads, 20,000
// writes, 20,000 deletes a day, 1 GiB storage), a GCP billing budget
// alert fires at low thresholds, and src/lib/firestore/rateLimit.ts
// throttles writes in-process as a backstop against a runaway loop,
// which matters more here than in a typical CRUD app because the
// voice agent can post several transactions from a single sentence.

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export function isFirestoreConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

let app: App | null = null;
let db: Firestore | null = null;

export function getFirebaseAdminApp(): App {
  if (!isFirestoreConfigured()) {
    throw new Error(
      "Firebase admin credentials are not configured (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)."
    );
  }
  if (!app) {
    if (!getApps().length) {
      app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Vercel env vars store newlines as the two-character escape;
          // a real private key needs them as actual line breaks.
          privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        }),
      });
    } else {
      app = getApps()[0]!;
    }
  }
  return app;
}

export function getFirestoreDb(): Firestore {
  if (!isFirestoreConfigured()) {
    throw new Error(
      "Firestore is not configured (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). Falling back to the local file store."
    );
  }
  if (!db) {
    db = getFirestore(getFirebaseAdminApp());
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}
