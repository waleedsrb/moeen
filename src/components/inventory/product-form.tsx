"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusButton } from "@/components/ui/status-button";
import { TagInput } from "@/components/ui/tag-input";
import { DropZone } from "@/components/ui/drop-zone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { X, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Product, ProductVariant } from "@/types/product";

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product;
  merchantId: string;
  onSuccess: () => void;
}

export function ProductForm({
  open,
  onOpenChange,
  product,
  merchantId,
  onSuccess,
}: ProductFormProps) {
  const isEditing = !!product;

  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product?.price?.toString() ?? "");
  const [currency, setCurrency] = useState(product?.currency ?? "ILS");
  const [quantity, setQuantity] = useState(
    product?.quantity_total?.toString() ?? "0"
  );
  const [description, setDescription] = useState(product?.description ?? "");
  const [altNames, setAltNames] = useState<string[]>(
    product?.alternative_names ?? []
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(
    product?.low_stock_threshold?.toString() ?? ""
  );
  const [variants, setVariants] = useState<ProductVariant[]>(
    product?.variants ?? []
  );
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [imagePreview, setImagePreview] = useState(product?.image_url ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    setName("");
    setPrice("");
    setCurrency("ILS");
    setQuantity("0");
    setDescription("");
    setAltNames([]);
    setLowStockThreshold("");
    setVariants([]);
    setIsActive(true);
    setImageUrl("");
    setImagePreview("");
    setImageFile(null);
    setError("");
  }

  function handleImageFile(file: File | undefined) {
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }



  function addVariant() {
    setVariants([...variants, { name: "", options: [] }]);
  }

  function updateVariant(
    index: number,
    field: "name" | "options",
    value: string
  ) {
    const updated = [...variants];
    if (field === "name") {
      updated[index] = { ...updated[index], name: value };
    } else {
      updated[index] = {
        ...updated[index],
        options: value.split(",").map((o) => o.trim()).filter(Boolean),
      };
    }
    setVariants(updated);
  }

  function removeVariant(index: number) {
    setVariants(variants.filter((_, i) => i !== index));
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return imageUrl || null;

    const supabase = createClient();
    const ext = imageFile.name.split(".").pop();
    const path = `${merchantId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, imageFile);

    if (error) throw new Error(`Image upload failed: ${error.message}`);

    const {
      data: { publicUrl },
    } = supabase.storage.from("product-images").getPublicUrl(path);

    return publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      let uploadedImageUrl: string | null = null;
      if (imageFile) {
        uploadedImageUrl = await uploadImage();
      } else {
        uploadedImageUrl = imageUrl || null;
      }

      const body = {
        name,
        price: parseFloat(price),
        currency,
        quantity_total: parseInt(quantity, 10),
        description: description || undefined,
        alternative_names: altNames.length > 0 ? altNames : undefined,
        low_stock_threshold: lowStockThreshold
          ? parseInt(lowStockThreshold, 10)
          : undefined,
        variants:
          variants.filter((v) => v.name && v.options.length > 0).length > 0
            ? variants.filter((v) => v.name && v.options.length > 0)
            : undefined,
        image_url: uploadedImageUrl ?? undefined,
        is_active: isActive,
      };

      const url = isEditing
        ? `/api/products/${product.id}`
        : "/api/products";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      if (!isEditing) resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Product" : "Add Product"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update product details"
              : "Add a new product to your catalog"}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          {/* Image Upload */}
          <div className="space-y-2">
            <Label>Product Image</Label>
            {imagePreview ? (
              <div className="relative rounded-lg border border-border p-4">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="mx-auto h-32 w-32 object-cover rounded-md"
                />
                <button
                  type="button"
                  aria-label="Remove image"
                  className="absolute top-2 end-2 bg-background rounded-full p-1"
                  onClick={() => {
                    setImagePreview("");
                    setImageFile(null);
                    setImageUrl("");
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <DropZone
                multiple={false}
                accept="image/jpeg,image/png,image/webp,image/gif"
                maxSize={5 * 1024 * 1024}
                title="Drop a product image"
                hint="JPEG, PNG, WebP or GIF, up to 5 MB"
                onFilesChange={(files) => handleImageFile(files[0])}
              />
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Product name"
              required
            />
          </div>

          {/* Price + Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="price">Price *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ILS">ILS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="JOD">JOD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="font-mono"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional product description"
              rows={3}
            />
          </div>

          {/* Alternative Names */}
          <div className="space-y-2">
            <Label>Alternative Names</Label>
            <p className="text-xs text-muted-foreground">
              Used by AI to match customer orders
            </p>
            <TagInput
              label="Alternative Names"
              placeholder="Add alternative name"
              createLabel={null}
              value={altNames.map((n) => ({ id: n, value: n }))}
              onValueChange={(tags) =>
                setAltNames([...new Set(tags.map((t) => t.value))])
              }
            />
          </div>

          {/* Low Stock Threshold */}
          <div className="space-y-2">
            <Label htmlFor="threshold">Low Stock Threshold</Label>
            <Input
              id="threshold"
              type="number"
              min="0"
              step="1"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              placeholder="Default: 5"
              className="font-mono"
            />
          </div>

          {/* Variants */}
          <div className="space-y-2">
            <Label>Variants</Label>
            {variants.map((variant, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input
                  value={variant.name}
                  onChange={(e) => updateVariant(i, "name", e.target.value)}
                  placeholder="e.g. Size"
                  className="flex-1"
                />
                <Input
                  value={variant.options.join(", ")}
                  onChange={(e) => updateVariant(i, "options", e.target.value)}
                  placeholder="S, M, L"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeVariant(i)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addVariant}
            >
              <Plus className="h-4 w-4 me-1" />
              Add Variant
            </Button>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="active">Active</Label>
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          {/* Submit */}
          <StatusButton
            type="submit"
            className="w-full"
            status={submitting ? "pending" : error ? "error" : "idle"}
            labels={{
              idle: isEditing ? "Save Changes" : "Add Product",
              pending: isEditing ? "Saving" : "Adding",
            }}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
