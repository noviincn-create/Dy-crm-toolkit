import type { DimKey, Row } from "./types";

interface Dim {
  label: string;
  key(r: Row): string;
  name(r: Row): string;
}

/** The ways the sales can be grouped. */
export const DIMS: Record<DimKey, Dim> = {
  product: { label: "محصول", key: (r) => r.productKey, name: (r) => r.product },
  customer: { label: "مشتری", key: (r) => (r.customer || "—").toLocaleLowerCase(), name: (r) => r.customer || "بدون مشتری" },
  owner: { label: "مالک فرصت", key: (r) => (r.owner || "—").toLocaleLowerCase(), name: (r) => r.owner || "نامشخص" },
  opportunity: { label: "فرصت", key: (r) => r.oppId || r.id, name: (r) => r.oppName || "فرصت بدون عنوان" },
};
