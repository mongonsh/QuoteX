import type { Customer, PricingRules, Product, RfqScenario, ShippingOption } from "./types.js";

export const customers: Customer[] = [
  {
    id: "nordlicht-retail",
    company: "Nordlicht Concept Stores GmbH",
    contact: "Lea Hoffmann",
    market: "Germany",
    language: "English",
    paymentTerms: "Net 30",
    creditLimitUsd: 120000,
    relationship: "Repeat buyer",
    memory: [
      {
        id: "mem-dhl-economy",
        type: "shipping_preference",
        title: "Prefers DHL Economy Select when freight stays under USD 1,000",
        evidence: "Accepted the DHL economy route on PO-1842 for the Berlin distribution center.",
        confidence: 0.94,
        updatedAt: "2026-06-24"
      },
      {
        id: "mem-nordlicht-payment",
        type: "commercial_preference",
        title: "Uses Net 30 payment terms for approved repeat orders",
        evidence: "Net 30 was approved on the last three wholesale cashmere orders.",
        confidence: 0.92,
        updatedAt: "2026-06-29"
      },
      {
        id: "mem-plastic-free-packaging",
        type: "fulfillment_preference",
        title: "Requires plastic-free paper sleeves and carton labels by color",
        evidence: "Berlin receiving approved the packaging standard on PO-1842.",
        confidence: 0.95,
        updatedAt: "2026-06-24"
      },
      {
        id: "mem-origin-documents",
        type: "compliance_preference",
        title: "Needs fiber composition and Mongolian certificate of origin before purchase order",
        evidence: "Compliance requested both documents during the previous order review.",
        confidence: 0.93,
        updatedAt: "2026-06-25"
      }
    ]
  },
  {
    id: "northstar-fitouts",
    company: "Northstar Fitouts",
    contact: "Maya Collins",
    market: "United States",
    language: "English",
    paymentTerms: "50% deposit",
    creditLimitUsd: 45000,
    relationship: "New buyer",
    memory: [
      {
        id: "mem-first-order",
        type: "risk_note",
        title: "New buyer requires deposit until first order clears",
        evidence: "Finance policy for customers without trade references.",
        confidence: 0.96,
        updatedAt: "2026-07-02"
      }
    ]
  },
  {
    id: "alba-industries",
    company: "Alba Industries GmbH",
    contact: "Jonas Weber",
    market: "Germany",
    language: "German / English",
    paymentTerms: "Net 15",
    creditLimitUsd: 110000,
    relationship: "Strategic account",
    memory: [
      {
        id: "mem-certification",
        type: "compliance_preference",
        title: "Always asks for CE declaration before approving PO",
        evidence: "CE documents requested on the last four projects.",
        confidence: 0.93,
        updatedAt: "2026-06-17"
      }
    ]
  }
];

export const products: Product[] = [
  {
    sku: "MNG-CASH-SCF",
    name: "Grade-A Mongolian Cashmere Scarf",
    category: "Apparel and textiles",
    aliases: [
      "mongolian cashmere scarf",
      "cashmere scarves",
      "grade-a cashmere",
      "cashmere wrap",
      "wholesale scarf"
    ],
    hsCode: "6214.20",
    origin: "MN",
    stock: 1600,
    unitCostUsd: 36,
    listPriceUsd: 68,
    leadTimeDays: 8,
    moq: 100,
    certification: [
      "100% cashmere composition report",
      "Mongolian certificate of origin"
    ]
  },
  {
    sku: "AUR-CTRL-24",
    name: "Aurora 24V LED Control Board",
    category: "Lighting electronics",
    aliases: ["aurora board", "aurora control", "24v controller", "control board", "same board"],
    hsCode: "8537.10",
    origin: "CN",
    stock: 1240,
    unitCostUsd: 18.8,
    listPriceUsd: 31.5,
    leadTimeDays: 2,
    moq: 100,
    certification: ["CE", "RoHS"]
  },
  {
    sku: "AUR-DRV-60",
    name: "Aurora 60W LED Driver",
    category: "Lighting power",
    aliases: ["aurora driver", "60w driver", "led power supply", "driver 60"],
    hsCode: "8504.40",
    origin: "CN",
    stock: 870,
    unitCostUsd: 11.25,
    listPriceUsd: 19.9,
    leadTimeDays: 1,
    moq: 200,
    certification: ["CE", "RoHS", "UL pending"]
  },
  {
    sku: "SEN-PIR-MINI",
    name: "Mini PIR Occupancy Sensor",
    category: "Sensors",
    aliases: ["pir sensor", "occupancy sensor", "motion sensor", "mini sensor"],
    hsCode: "9031.80",
    origin: "MY",
    stock: 2200,
    unitCostUsd: 4.1,
    listPriceUsd: 8.4,
    leadTimeDays: 1,
    moq: 300,
    certification: ["CE", "FCC"]
  },
  {
    sku: "CTRL-WIFI-2CH",
    name: "Two Channel Wi-Fi Lighting Controller",
    category: "Smart controls",
    aliases: ["wifi controller", "2 channel controller", "smart light controller", "wireless controller"],
    hsCode: "8537.10",
    origin: "VN",
    stock: 420,
    unitCostUsd: 13.2,
    listPriceUsd: 24.0,
    leadTimeDays: 5,
    moq: 150,
    certification: ["CE", "FCC", "RoHS"]
  }
];

export const shippingOptions: ShippingOption[] = [
  {
    id: "dhl-cn-jp",
    route: "Shenzhen -> Yokohama",
    carrier: "DHL Express",
    mode: "Air",
    days: 3,
    costUsd: 386,
    reliability: 0.94,
    markets: ["Japan"]
  },
  {
    id: "sf-cn-jp",
    route: "Shenzhen -> Osaka",
    carrier: "SF International",
    mode: "Air",
    days: 4,
    costUsd: 318,
    reliability: 0.88,
    markets: ["Japan"]
  },
  {
    id: "ocean-cn-jp",
    route: "Shenzhen -> Yokohama",
    carrier: "Ocean LCL",
    mode: "Sea",
    days: 16,
    costUsd: 142,
    reliability: 0.81,
    markets: ["Japan"]
  },
  {
    id: "ups-cn-us",
    route: "Shenzhen -> Los Angeles",
    carrier: "UPS Worldwide",
    mode: "Air",
    days: 5,
    costUsd: 612,
    reliability: 0.91,
    markets: ["United States"]
  },
  {
    id: "dhl-cn-de",
    route: "Shenzhen -> Hamburg",
    carrier: "DHL Express",
    mode: "Air",
    days: 5,
    costUsd: 548,
    reliability: 0.92,
    markets: ["Germany"],
    customerIds: ["alba-industries"]
  },
  {
    id: "rail-cn-de",
    route: "Chongqing -> Duisburg",
    carrier: "China-Europe Rail",
    mode: "Rail",
    days: 19,
    costUsd: 286,
    reliability: 0.84,
    markets: ["Germany"],
    customerIds: ["alba-industries"]
  },
  {
    id: "dhl-mn-de-economy",
    route: "Ulaanbaatar -> Berlin",
    carrier: "DHL Economy Select",
    mode: "Consolidated air",
    days: 12,
    costUsd: 820,
    reliability: 0.91,
    markets: ["Germany"],
    customerIds: ["nordlicht-retail"]
  },
  {
    id: "dhl-mn-de-express",
    route: "Ulaanbaatar -> Berlin",
    carrier: "DHL Express",
    mode: "Priority air",
    days: 5,
    costUsd: 1480,
    reliability: 0.96,
    markets: ["Germany"],
    customerIds: ["nordlicht-retail"]
  },
  {
    id: "cargo-mn-de",
    route: "Ulaanbaatar -> Berlin",
    carrier: "MIAT Cargo",
    mode: "Scheduled air cargo",
    days: 8,
    costUsd: 960,
    reliability: 0.88,
    markets: ["Germany"],
    customerIds: ["nordlicht-retail"]
  }
];

export const rfqScenarios: RfqScenario[] = [
  {
    id: "nordlicht-cashmere-500",
    customerId: "nordlicht-retail",
    receivedAt: "2026-07-18T09:18:00+02:00",
    channel: "Buyer email",
    subject: "500 Mongolian cashmere scarves for Berlin",
    rawMessage:
      "Hello, please quote 500 Grade-A Mongolian cashmere scarves for our Berlin stores: 200 charcoal, 150 forest green, and 150 natural oat. Use plastic-free paper sleeves and carton labels by color. Deliver DDP Berlin within 21 days. Keep freight under USD 1,000 and use our usual payment terms. Include the fiber composition report and Mongolian certificate of origin.",
    expectedQuantity: 500,
    origin: "Ulaanbaatar, Mongolia",
    destination: "Berlin distribution center",
    deadlineDays: 21,
    priority: "High",
    demoLabel: "Start here"
  },
  {
    id: "nordlicht-cashmere-replay",
    customerId: "nordlicht-retail",
    receivedAt: "2026-07-19T08:45:00+02:00",
    channel: "Buyer email",
    subject: "Repeat order for 800 cashmere scarves",
    rawMessage:
      "Please repeat the approved cashmere scarf order for 800 units: 300 charcoal, 250 forest green, and 250 natural oat. Use the previous plastic-free packaging, payment terms, and freight decision. Deliver DDP Berlin within 24 days and include the same origin documents.",
    expectedQuantity: 800,
    origin: "Ulaanbaatar, Mongolia",
    destination: "Berlin distribution center",
    deadlineDays: 24,
    priority: "High",
    demoLabel: "Memory replay"
  },
  {
    id: "northstar-ambiguous",
    customerId: "northstar-fitouts",
    receivedAt: "2026-07-07T11:42:00-07:00",
    channel: "Forwarded email",
    subject: "Need the Aurora units for hotel rooms",
    rawMessage:
      "Can you quote 650 Aurora units for the Reno hotel job? Last supplier sent the wrong thing. We need the controller, not the power brick, unless the 60W driver is required for install. Ship to Los Angeles. Target delivery July 16.",
    expectedQuantity: 650,
    destination: "Los Angeles job site",
    deadlineDays: 9,
    priority: "Medium"
  },
  {
    id: "alba-ce-controllers",
    customerId: "alba-industries",
    receivedAt: "2026-07-07T16:08:00+02:00",
    channel: "Portal note",
    subject: "Wi-Fi controllers with CE declaration",
    rawMessage:
      "Please prepare price for 300 two channel Wi-Fi lighting controllers. Delivery Hamburg. Include CE declaration and RoHS statement in the offer. If air freight is above 550 USD, show rail option as alternative.",
    expectedQuantity: 300,
    destination: "Hamburg DC",
    deadlineDays: 21,
    priority: "Medium"
  }
];

export const pricingRules: PricingRules = {
  targetMargin: 0.32,
  floorMargin: 0.24,
  repeatBuyerDiscount: 0.03,
  strategicAccountDiscount: 0.045,
  newBuyerDepositRate: 0.5,
  quoteValidityDays: 7
};
