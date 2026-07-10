import type { Customer, PricingRules, Product, RfqScenario, ShippingOption } from "./types.js";

export const customers: Customer[] = [
  {
    id: "mori-lighting",
    company: "Mori Lighting Co.",
    contact: "Aiko Tanaka",
    market: "Japan",
    language: "Japanese / English",
    paymentTerms: "Net 30",
    creditLimitUsd: 92000,
    relationship: "Repeat buyer",
    memory: [
      {
        id: "mem-dhl-speed",
        type: "shipping_preference",
        title: "Prefers DHL Express when freight is under USD 420",
        evidence: "Accepted SO-4821 after sea freight was replaced with DHL.",
        confidence: 0.91,
        updatedAt: "2026-06-21"
      },
      {
        id: "mem-payment",
        type: "commercial_preference",
        title: "Requests Net 30 terms on every repeat order",
        evidence: "Mentioned in three approved quotes since May.",
        confidence: 0.88,
        updatedAt: "2026-06-28"
      },
      {
        id: "mem-packaging",
        type: "fulfillment_preference",
        title: "Needs carton labels in Japanese for warehouse receiving",
        evidence: "Warehouse rejected unlabeled cartons on SO-4690.",
        confidence: 0.84,
        updatedAt: "2026-05-30"
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
    sku: "AUR-CTRL-24",
    name: "Aurora 24V LED Control Board",
    category: "Lighting electronics",
    aliases: ["aurora board", "aurora control", "24v controller", "同じ基板", "基板", "same board"],
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
    markets: ["Germany"]
  },
  {
    id: "rail-cn-de",
    route: "Chongqing -> Duisburg",
    carrier: "China-Europe Rail",
    mode: "Rail",
    days: 19,
    costUsd: 286,
    reliability: 0.84,
    markets: ["Germany"]
  }
];

export const rfqScenarios: RfqScenario[] = [
  {
    id: "mori-repeat-500",
    customerId: "mori-lighting",
    receivedAt: "2026-07-07T09:18:00+09:00",
    channel: "Email",
    subject: "同じ基板を500個、来週金曜まで",
    rawMessage:
      "田中です。前回と同じAurora用の基板を500個お願いします。来週金曜までに横浜倉庫へ。送料は安い方がいいですが、遅れるならDHLでもOKです。支払いはいつものNet 30で見積ください。",
    expectedQuantity: 500,
    destination: "Yokohama warehouse",
    deadlineDays: 7,
    priority: "High"
  },
  {
    id: "mori-memory-replay",
    customerId: "mori-lighting",
    receivedAt: "2026-07-08T08:45:00+09:00",
    channel: "Email",
    subject: "前回と同じ条件で追加800個",
    rawMessage:
      "田中です。前回承認したAurora基板を追加で800個お願いします。同じ支払い条件と配送判断で、横浜倉庫へ10日以内に届く見積をください。",
    expectedQuantity: 800,
    destination: "Yokohama warehouse",
    deadlineDays: 10,
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
