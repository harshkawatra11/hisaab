// No login in this build: every store call runs against one demo
// merchant. This costs nothing to remove later, because the store
// layer already takes and checks ownerUid on every read and write (see
// src/lib/store/types.ts), so real auth becomes a change to this one
// constant's call sites rather than a change to every route.
export const DEMO_OWNER_UID = "demo-merchant";
