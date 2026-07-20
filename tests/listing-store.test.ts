import assert from "node:assert/strict";
import {
  ListingValidationError,
  SellerListingStore
} from "../server/listing-store.js";

const pngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const store = new SellerListingStore(":memory:");

try {
  assert.deepEqual(store.list(), []);

  const listing = store.create({
    sellerName: "Maya Chen",
    sellerEmail: "maya@example.com",
    sellerLocation: "Tokyo, Japan",
    targetMarket: "United States",
    brand: "Hermes",
    model: "Birkin 25",
    category: "Handbag",
    condition: "Excellent",
    color: "Vert Vertigo",
    material: "Togo leather",
    manufactureYear: 2023,
    askingPriceUsd: 15_000,
    desiredSaleDays: 30,
    description: "Carried twice and stored in its dust bag.",
    authenticityNotes: "Original receipt is available.",
    ownershipConfirmed: true,
    photo: {
      fileName: "birkin.png",
      mimeType: "image/png",
      sizeBytes: 68,
      dataUrl: pngDataUrl
    }
  });

  assert.match(listing.id, /^[0-9a-f-]{36}$/);
  assert.equal(listing.brand, "Hermes");
  assert.equal(listing.askingPriceUsd, 15_000);
  assert.equal(listing.status, "intake");
  assert.equal(listing.photo.url, `/api/listings/${listing.id}/photo`);
  assert.equal(store.list().length, 1);

  const storedPhoto = store.getPhoto(listing.id);
  assert.ok(storedPhoto);
  assert.equal(storedPhoto.photo.mimeType, "image/png");
  assert.equal(Buffer.from(storedPhoto.bytes).subarray(0, 4).toString("hex"), "89504e47");

  assert.throws(
    () => store.create({ ...listing, sellerEmail: "not-an-email", photo: { ...listing.photo, dataUrl: pngDataUrl } }),
    ListingValidationError
  );

  assert.equal(store.delete(listing.id), true);
  assert.equal(store.delete(listing.id), false);
  assert.deepEqual(store.list(), []);
} finally {
  store.close();
}

console.log("listing-store tests passed");
