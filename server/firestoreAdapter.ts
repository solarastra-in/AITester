/**
 * Thin abstraction over the specific Firestore operations server/db.ts
 * needs, so the real Firebase Admin SDK client can be swapped for an
 * in-memory fake in tests — this sandbox has no network path to
 * firestore.googleapis.com, so the real adapter's behavior against actual
 * Firestore could not be executed here; what CAN be verified (and is,
 * exhaustively, in tests/firestoreSync.test.ts) is the sync/diff logic in
 * server/db.ts against this interface, using FakeFirestoreAdapter.
 */

export interface FirestoreDoc {
  id: string;
  data: Record<string, any>;
}

export type FirestoreWriteOp =
  | { type: 'set'; collection: string; id: string; data: Record<string, any> }
  | { type: 'delete'; collection: string; id: string };

export interface FirestoreAdapter {
  /** Fetches every document currently in a collection. */
  getCollection(name: string): Promise<FirestoreDoc[]>;
  /** Applies a batch of set/delete operations atomically (or as close to atomically as the backing store allows). */
  commitBatch(ops: FirestoreWriteOp[]): Promise<void>;
}

/**
 * Real, production adapter backed by the Firebase Admin SDK, pointed at
 * this project's specific named Firestore database (not the default one —
 * see firebase-applet-config.json's firestoreDatabaseId). Initializes
 * lazily on first use so importing this module never fails just because
 * credentials aren't configured yet (e.g. during `tsc --noEmit` or when a
 * test never actually constructs this class).
 */
export class AdminFirestoreAdapter implements FirestoreAdapter {
  private firestore: any = null;

  private async getFirestore(): Promise<any> {
    if (this.firestore) return this.firestore;

    const { getApps, initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const fsMod = await import('fs');
    const pathMod = await import('path');

    let defaultDatabaseId = '';
    let defaultProjectId = '';
    try {
      const cfgPath = pathMod.join(process.cwd(), 'firebase-applet-config.json');
      if (fsMod.existsSync(cfgPath)) {
        const parsed = JSON.parse(fsMod.readFileSync(cfgPath, 'utf-8'));
        defaultDatabaseId = parsed.firestoreDatabaseId || '';
        defaultProjectId = parsed.projectId || '';
      }
    } catch {
      // ignore
    }

    if (getApps().length === 0) {
      // Prefer an explicit service account key (required for Vercel, which
      // has no Application Default Credentials); fall back to ADC, which
      // works automatically on Cloud Run/GCP without any extra
      // configuration.
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (serviceAccountJson) {
        let serviceAccount: any;
        try {
          serviceAccount = JSON.parse(serviceAccountJson);
        } catch {
          throw new Error(
            'FIREBASE_SERVICE_ACCOUNT_KEY is set but is not valid JSON. It should be the full JSON key file contents for a service account with Firestore access, as a single-line string.'
          );
        }
        initializeApp({ credential: cert(serviceAccount) });
      } else {
        initializeApp({
          credential: applicationDefault(),
          projectId: defaultProjectId || undefined,
        });
      }
    }

    const databaseId = process.env.FIRESTORE_DATABASE_ID || defaultDatabaseId || undefined;
    this.firestore = databaseId ? getFirestore(databaseId) : getFirestore();
    return this.firestore;
  }

  async getCollection(name: string): Promise<FirestoreDoc[]> {
    const fs = await this.getFirestore();
    const snap = await fs.collection(name).get();
    return snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
  }

  async commitBatch(ops: FirestoreWriteOp[]): Promise<void> {
    if (ops.length === 0) return;
    const fs = await this.getFirestore();

    // Firestore batches are capped at 500 operations; chunk defensively —
    // this app's data volume is small today, but this keeps save() correct
    // if that changes rather than silently failing past the limit.
    const CHUNK_SIZE = 450;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = fs.batch();
      for (const op of chunk) {
        const ref = fs.collection(op.collection).doc(op.id);
        if (op.type === 'set') {
          batch.set(ref, op.data);
        } else {
          batch.delete(ref);
        }
      }
      await batch.commit();
    }
  }
}

/**
 * In-memory fake adapter for tests — no network access, no real Firestore
 * project touched. Behaves like a real Firestore collection store closely
 * enough to exercise server/db.ts's sync/diff logic meaningfully: separate
 * named collections, each a map of document id -> data.
 */
export class FakeFirestoreAdapter implements FirestoreAdapter {
  private store = new Map<string, Map<string, Record<string, any>>>();

  /** Test helper: seed a collection directly, bypassing commitBatch. */
  seed(collection: string, docs: FirestoreDoc[]) {
    const map = new Map<string, Record<string, any>>();
    for (const d of docs) map.set(d.id, d.data);
    this.store.set(collection, map);
  }

  /** Test helper: inspect what's currently "persisted" in a collection. */
  dump(collection: string): FirestoreDoc[] {
    const map = this.store.get(collection);
    if (!map) return [];
    return Array.from(map.entries()).map(([id, data]) => ({ id, data }));
  }

  async getCollection(name: string): Promise<FirestoreDoc[]> {
    return this.dump(name);
  }

  async commitBatch(ops: FirestoreWriteOp[]): Promise<void> {
    for (const op of ops) {
      let map = this.store.get(op.collection);
      if (!map) {
        map = new Map();
        this.store.set(op.collection, map);
      }
      if (op.type === 'set') {
        map.set(op.id, op.data);
      } else {
        map.delete(op.id);
      }
    }
  }
}
