import { createContext, createElement, useContext, type ReactNode } from "react";
import type { TaskMetadataIndex, TaskMetadataRecord, TaskProjection } from "@omp/product-contracts";

/**
 * The single seam between the product renderer and any transport. Plan 1 ships only
 * the fixture implementation; plan 2's real Host transport plugs in behind the same
 * interface, so the UI tree never knows which one is active.
 */
export type ProductBridge = {
  listTasks(): Promise<TaskProjection[]>;
  getTaskMetadata(): Promise<TaskMetadataIndex>;
  setTaskMetadata(sessionId: string, patch: Partial<TaskMetadataRecord>): Promise<TaskMetadataRecord>;
};

export const ProductBridgeContext = createContext<ProductBridge | null>(null);

export function ProductBridgeProvider({
  bridge,
  children
}: {
  bridge: ProductBridge;
  children: ReactNode;
}) {
  return createElement(ProductBridgeContext.Provider, { value: bridge }, children);
}

export function useProductBridge(): ProductBridge {
  const bridge = useContext(ProductBridgeContext);
  if (!bridge) throw new Error("PRODUCT_BRIDGE_MISSING");
  return bridge;
}
