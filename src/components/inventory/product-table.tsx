"use client";

import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Package } from "lucide-react";
import { StockBar } from "./stock-bar";
import type { Product } from "@/types/product";
import {
  getStockStatus,
  getStockBadgeVariant,
  getStockLabel,
  getAvailableQuantity,
  formatPrice,
} from "@/lib/utils/inventory";

interface ProductTableProps {
  products: Product[];
  merchantThreshold?: number;
  selectedIds?: Set<string>;
  /** Present only in select mode. */
  onSelectedChange?: (ids: string[]) => void;
}

export function ProductTable({
  products,
  merchantThreshold,
  selectedIds,
  onSelectedChange,
}: ProductTableProps) {
  const columns: DataTableColumn<Product>[] = [
    {
      key: "image",
      header: "",
      width: "48px",
      card: "hidden",
      cell: (product) => (
        <Link href={`/inventory/${product.id}`} aria-label={product.name}>
          <div className="h-8 w-8 rounded bg-muted overflow-hidden flex items-center justify-center">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                width={32}
                height={32}
                sizes="32px"
                className="h-full w-full object-cover"
              />
            ) : (
              <Package className="h-4 w-4 text-muted-foreground/40" />
            )}
          </div>
        </Link>
      ),
    },
    {
      key: "name",
      header: "Name",
      width: "minmax(0,1.6fr)",
      sortable: true,
      card: "title",
      cell: (product) => (
        <Link
          href={`/inventory/${product.id}`}
          className="font-medium hover:underline"
        >
          {product.name}
        </Link>
      ),
    },
    {
      key: "price",
      header: "Price",
      sortable: true,
      align: "right",
      card: "trailing",
      cell: (product) => (
        <span className="font-mono">
          {formatPrice(product.price, product.currency)}
        </span>
      ),
    },
    {
      key: "quantity_total",
      header: "Total",
      sortable: true,
      align: "right",
      card: "hidden",
      cell: (product) => <span className="font-mono">{product.quantity_total}</span>,
    },
    {
      key: "quantity_reserved",
      header: "Reserved",
      sortable: true,
      align: "right",
      card: "hidden",
      cell: (product) => (
        <span className="font-mono">{product.quantity_reserved}</span>
      ),
    },
    {
      key: "available",
      header: "Available",
      sortable: true,
      align: "right",
      value: (product) => getAvailableQuantity(product),
      cell: (product) => (
        <span className="font-mono">{getAvailableQuantity(product)}</span>
      ),
    },
    {
      key: "stock",
      header: "Stock",
      width: "96px",
      card: "hidden",
      value: (product) => getAvailableQuantity(product),
      cell: (product) => (
        <StockBar product={product} merchantThreshold={merchantThreshold} />
      ),
    },
    {
      key: "status",
      header: "Status",
      card: "subtitle",
      value: (product) => getStockLabel(getStockStatus(product, merchantThreshold)),
      cell: (product) => {
        const status = getStockStatus(product, merchantThreshold);
        return (
          <Badge variant={getStockBadgeVariant(status)}>
            {getStockLabel(status)}
          </Badge>
        );
      },
    },
  ];

  return (
    <DataTable
      label="Products"
      noun={["product", "products"]}
      columns={columns}
      rows={products}
      pageSize={25}
      rowLabel={(product) => product.name}
      selectable={!!onSelectedChange}
      selected={selectedIds ? [...selectedIds] : undefined}
      onSelectedChange={onSelectedChange}
    />
  );
}
