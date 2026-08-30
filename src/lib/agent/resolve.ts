// Resolves a spoken/typed name to an existing Party or Product, or
// creates a new Party when none matches closely enough. Products are
// never invented: the catalog is fixed (a shopkeeper can't sell a
// product the shop has never priced), so an unresolved product name is
// a rejected tool call, not a guess.

import { makeId } from "@/lib/ids";
import { normalizeName } from "@/lib/recon/normalize";
import { nameSim } from "@/lib/recon/signals";
import type { HisaabStore } from "@/lib/store/types";
import type { Party, PartyKind, Product } from "@/lib/types";

const PARTY_FUZZY_FLOOR = 0.72;
const PRODUCT_FUZZY_FLOOR = 0.72;

export async function resolveParty(
  store: HisaabStore,
  ownerUid: string,
  kind: PartyKind,
  rawName: string
): Promise<Party> {
  const normalized = normalizeName(rawName);
  const exact = await store.findPartyByName(ownerUid, normalized);
  if (exact) return exact;

  const all = await store.listParties(ownerUid);
  const candidates = all.filter((p) => p.kind === kind);
  let best: Party | null = null;
  let bestScore = 0;
  for (const p of candidates) {
    const score = nameSim(normalized, p.normalizedName);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best && bestScore >= PARTY_FUZZY_FLOOR) return best;

  const created: Party = {
    id: makeId("pty"),
    ownerUid,
    kind,
    name: rawName.trim(),
    normalizedName: normalized,
    createdAt: new Date().toISOString(),
  };
  await store.upsertParty(created);
  return created;
}

export class ProductNotFoundError extends Error {
  constructor(rawName: string) {
    super(
      `"${rawName}" is not a product this shop has priced yet. Add it first, or confirm the exact product name.`
    );
    this.name = "ProductNotFoundError";
  }
}

export async function resolveProduct(
  store: HisaabStore,
  ownerUid: string,
  rawName: string
): Promise<Product> {
  const normalized = normalizeName(rawName);
  const exact = await store.findProductByName(ownerUid, normalized);
  if (exact) return exact;

  const all = await store.listProducts(ownerUid);
  let best: Product | null = null;
  let bestScore = 0;
  for (const p of all) {
    const score = nameSim(normalized, p.normalizedName);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best && bestScore >= PRODUCT_FUZZY_FLOOR) return best;

  throw new ProductNotFoundError(rawName);
}
