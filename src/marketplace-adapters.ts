import type { Analysis, MarketingAsset, SellerListing } from "./types.js";

export type MarketplaceId = "ebay" | "amazon" | "alibaba";

export interface MarketplaceField {
  label: string;
  value: string;
}

export interface MarketplaceDraft {
  id: MarketplaceId;
  name: string;
  audience: string;
  title: string;
  status: "draft-ready" | "needs-info";
  fields: MarketplaceField[];
  missingFields: string[];
  warnings: string[];
  payload: Record<string, unknown>;
}

export function buildMarketplaceDrafts({
  listing,
  analysis,
  asset
}: {
  listing: SellerListing;
  analysis: Analysis | null;
  asset: MarketingAsset | null;
}): MarketplaceDraft[] {
  const imageReference = asset?.fileName || listing.photo.url;
  const productName = compact([listing.brand, listing.model, listing.color].filter(Boolean).join(" "), 120);
  const description = compact(listing.description, 1_200);
  const price = analysis?.quote.unitPrice || listing.askingPriceUsd;

  return [
    buildEbayDraft({ listing, analysis, productName, description, price, imageReference }),
    buildAmazonDraft({ listing, analysis, productName, description, price, imageReference }),
    buildAlibabaDraft({ listing, analysis, productName, description, price, imageReference })
  ];
}

function buildEbayDraft({
  listing,
  analysis,
  productName,
  description,
  price,
  imageReference
}: DraftContext): MarketplaceDraft {
  const quantity = channelQuantity(listing, analysis);
  const wholesale = isWholesaleOffer(analysis);
  const missingFields = ["eBay category ID"];
  const payload = {
    sku: listingSku(listing),
    marketplaceId: marketCode(listing.targetMarket),
    title: compact(productName, 80),
    description,
    condition: ebayCondition(listing.condition),
    pricingSummary: { price: { value: price.toFixed(2), currency: "USD" } },
    availableQuantity: quantity,
    itemSpecifics: {
      Brand: listing.brand,
      Model: listing.model,
      Color: listing.color,
      Material: listing.material || undefined,
      Year: listing.manufactureYear || undefined
    },
    imageReference,
    merchantLocation: listing.sellerLocation,
    publishMode: "VALIDATION_ONLY"
  };

  return {
    id: "ebay",
    name: "eBay",
    audience: wholesale ? "Retail channel preview" : "Consumer resale",
    title: payload.title,
    status: "needs-info",
    fields: [
      { label: "Price", value: `$${price.toLocaleString("en-US")}` },
      { label: "Quantity", value: quantity.toLocaleString("en-US") },
      { label: "Condition", value: listing.condition }
    ],
    missingFields,
    warnings: ["A category ID and OAuth consent are required before the Inventory API can publish."],
    payload
  };
}

function buildAmazonDraft({
  listing,
  analysis,
  productName,
  description,
  price,
  imageReference
}: DraftContext): MarketplaceDraft {
  const quantity = channelQuantity(listing, analysis);
  const missingFields = ["Amazon product type", "GTIN or exemption", "Marketplace category attributes"];
  const payload = {
    sellerSku: listingSku(listing),
    marketplaceIds: [amazonMarketplaceId(listing.targetMarket)],
    productType: null,
    requirements: "LISTING",
    attributes: {
      item_name: [{ value: compact(productName, 200), language_tag: "en_US" }],
      brand: [{ value: listing.brand }],
      model_name: [{ value: listing.model }],
      condition_type: [{ value: amazonCondition(listing.condition) }],
      list_price: [{ value: price, currency: "USD" }],
      product_description: [{ value: description, language_tag: "en_US" }],
      fulfillment_availability: [
        { fulfillment_channel_code: "DEFAULT", quantity }
      ],
      merchant_suggested_asin: [],
      image_reference: imageReference
    },
    publishMode: "VALIDATION_PREVIEW"
  };

  return {
    id: "amazon",
    name: "Amazon",
    audience: "Structured retail catalog",
    title: compact(productName, 200),
    status: "needs-info",
    fields: [
      { label: "Price", value: `$${price.toLocaleString("en-US")}` },
      { label: "SKU", value: listingSku(listing) },
      { label: "Available", value: quantity.toLocaleString("en-US") }
    ],
    missingFields,
    warnings: ["Amazon Listings Items validation depends on product-type schemas for the selected marketplace."],
    payload
  };
}

function buildAlibabaDraft({
  listing,
  analysis,
  productName,
  description,
  price,
  imageReference
}: DraftContext & { analysis: Analysis | null }): MarketplaceDraft {
  const wholesale = isWholesaleOffer(analysis);
  const minimumOrder = wholesale
    ? analysis!.selectedProduct.product.moq
    : 1;
  const supplyQuantity = channelQuantity(listing, analysis);
  const missingFields = ["Alibaba category ID", "Incoterm and dispatch port"];
  const payload = {
    externalProductId: listingSku(listing),
    subject: compact(productName, 128),
    categoryId: null,
    description,
    keywords: unique([listing.brand, listing.model, listing.category, listing.color]),
    tradeInformation: {
      minOrderQuantity: minimumOrder,
      supplyQuantity,
      unit: "piece",
      priceRange: [{ startQuantity: minimumOrder, price: price.toFixed(2), currency: "USD" }],
      dispatchDays: Math.max(1, analysis?.selectedProduct.product.leadTimeDays || 2)
    },
    logistics: analysis
      ? {
          route: analysis.shipping.route,
          carrier: analysis.shipping.carrier,
          estimatedDays: analysis.shipping.days,
          freightUsd: analysis.shipping.costUsd
        }
      : null,
    imageReference,
    publishMode: "DRAFT_ONLY"
  };

  return {
    id: "alibaba",
    name: "Alibaba.com",
    audience: "Cross-border wholesale",
    title: payload.subject,
    status: "needs-info",
    fields: [
      { label: "MOQ", value: `${minimumOrder.toLocaleString("en-US")} pieces` },
      { label: "Price", value: `$${price.toLocaleString("en-US")}` },
      { label: "Supply", value: `${supplyQuantity.toLocaleString("en-US")} pieces` }
    ],
    missingFields,
    warnings: [
      wholesale
        ? "Category confirmation and seller OAuth are required before this wholesale draft can publish."
        : "Single-item resale is supported as a draft, but Alibaba.com is strongest for repeatable supply."
    ],
    payload
  };
}

interface DraftContext {
  listing: SellerListing;
  analysis: Analysis | null;
  productName: string;
  description: string;
  price: number;
  imageReference: string;
}

function isWholesaleOffer(analysis: Analysis | null): analysis is Analysis {
  return Boolean(analysis && analysis.rfq.source !== "seller-listing");
}

function channelQuantity(listing: SellerListing, analysis: Analysis | null): number {
  if (!isWholesaleOffer(analysis)) return 1;
  return Math.max(
    analysis.quote.quantity,
    Math.min(analysis.selectedProduct.product.stock, 999_999)
  );
}

function listingSku(listing: SellerListing): string {
  return `QX-${listing.id.replace(/[^a-z0-9]/gi, "").slice(0, 12).toUpperCase()}`;
}

function ebayCondition(condition: SellerListing["condition"]): string {
  if (condition === "New or unworn") return "NEW";
  return "USED_EXCELLENT";
}

function amazonCondition(condition: SellerListing["condition"]): string {
  if (condition === "New or unworn") return "new_new";
  if (condition === "Excellent" || condition === "Very good") return "used_like_new";
  if (condition === "Good") return "used_good";
  return "used_acceptable";
}

function marketCode(market: SellerListing["targetMarket"]): string {
  if (market === "Japan") return "EBAY_JP";
  if (market === "Germany") return "EBAY_DE";
  return "EBAY_US";
}

function amazonMarketplaceId(market: SellerListing["targetMarket"]): string {
  if (market === "Japan") return "A1VC38T7YXB528";
  if (market === "Germany") return "A1PA6795UKMFR9";
  return "ATVPDKIKX0DER";
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function compact(value: string, maxLength: number): string {
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).trimEnd();
}
