// Applies transaction item quantities to product stock. Never blocks a
// posting on negative stock: a real shopkeeper's physical count drifts
// from the system's count constantly, and refusing the entry would
// lose the financial event over a stock-count disagreement that is not
// actually this system's job to arbitrate. Negative stock is instead a
// soft warning the caller can choose to surface.

import type { Product, Transaction } from "@/lib/types";

export interface StockWarning {
  productId: string;
  productName: string;
  resultingQty: number;
}

export interface ApplyInventoryResult {
  updatedProducts: Product[];
  warnings: StockWarning[];
}

export function applyTransactionToInventory(
  products: Product[],
  transaction: Transaction
): ApplyInventoryResult {
  const byId = new Map(products.map((p) => [p.id, { ...p }]));
  const warnings: StockWarning[] = [];

  const direction =
    transaction.type === "purchase" ? 1 : transaction.type === "cash_sale" || transaction.type === "credit_sale" ? -1 : 0;

  if (direction === 0) {
    return { updatedProducts: [...byId.values()], warnings };
  }

  for (const item of transaction.items) {
    const product = byId.get(item.productId);
    if (!product) continue;
    product.stockQty += direction * item.qty;
    if (product.stockQty < 0) {
      warnings.push({
        productId: product.id,
        productName: product.name,
        resultingQty: product.stockQty,
      });
    }
  }

  return { updatedProducts: [...byId.values()], warnings };
}
