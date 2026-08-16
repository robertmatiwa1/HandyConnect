export type ServiceCandidate = {
  key: string;
  name: string;
};

export type ServiceClassification =
  | { scope: "supported"; candidate: ServiceCandidate }
  | { scope: "unsupported"; candidate: null }
  | { scope: "unclear"; candidate: null };

const prohibitedPatterns = [
  /\b(sex|sexual|escort|prostitut|porn|nude|naked|genital|penis|dick|vagina|pussy|breast)\w*\b/i,
  /\b(hit|hurt|kill|attack|threaten|weapon)\w*\b/i,
  /\b(drug|cocaine|heroin|meth|dagga)\w*\b/i,
];

const outOfScopePatterns = [
  /\b(baby|pregnan(?:t|cy)|fertility|inseminat(?:e|ion)|surrog(?:ate|acy))\b/i,
  /\b(body|doctor|nurse|medical|medicine|therapy|therapist|counsell?ing)\b/i,
  /\b(car|vehicle|bakkie|motorbike|engine|tyre|windscreen)\b/i,
];

const commonServiceTypos: Readonly<Record<string, string>> = {
  tiolet: "toilet",
  toliet: "toilet",
  toiet: "toilet",
  pluming: "plumbing",
  plummer: "plumber",
  electical: "electrical",
  eletrical: "electrical",
  carpentar: "carpenter",
  cabnet: "cabinet",
  cieling: "ceiling",
  guter: "gutter",
  fawcet: "faucet",
};

export function normalizeServiceTypos(description: string): string {
  return description.replace(/\b[\p{L}]+\b/gu, (word) => {
    const replacement = commonServiceTypos[word.toLocaleLowerCase("en-ZA")];
    return replacement ?? word;
  });
}

const services: Array<ServiceCandidate & { patterns: RegExp[] }> = [
  { key: "plumbing", name: "Plumbing", patterns: [/\b(plumb|tap|faucet|toilet|basin|sink|pipe|drain|geyser|shower|bath|water leak|blocked drain)\w*\b/i] },
  { key: "electrical", name: "Electrical", patterns: [/\b(electric|socket|plug point|light switch|light fitting|wiring|db board|circuit breaker|power trip)\w*\b/i] },
  { key: "carpentry", name: "Carpentry", patterns: [/\b(carpent|cupboard|cabinet|wooden door|woodwork|timber|shel(?:f|ves))\w*\b/i] },
  { key: "painting", name: "Painting", patterns: [/\b(paint|repaint|wall colour|peeling wall)\w*\b/i] },
  { key: "roofing", name: "Roofing", patterns: [/\b(roof|roof tile|roof leak)\w*\b/i] },
  { key: "appliance", name: "Appliance Repair", patterns: [/\b(fridge|freezer|stove|oven|washing machine|dishwasher|tumble dryer|appliance)\w*\b/i] },
  { key: "locksmith", name: "Locksmith", patterns: [/\b(locksmith|door lock|padlock|lost key|broken key)\w*\b/i] },
  { key: "tiling", name: "Tiling", patterns: [/\b(tile|tiling|grout)\w*\b/i] },
  { key: "waterproofing", name: "Waterproofing", patterns: [/\b(waterproof|rising damp|damp wall)\w*\b/i] },
  { key: "paving", name: "Paving", patterns: [/\b(paving|paver|driveway brick)\w*\b/i] },
  { key: "gardening", name: "Gardening & Landscaping", patterns: [/\b(garden|landscap|grass|lawn|hedge|tree trimming|weeding)\w*\b/i] },
  { key: "pool", name: "Pool Maintenance", patterns: [/\b(swimming pool|pool pump|pool filter|pool cleaning)\w*\b/i] },
  { key: "hvac", name: "Air Conditioning & HVAC", patterns: [/\b(air ?con|air conditioning|hvac)\w*\b/i] },
  { key: "welding", name: "Welding & Metalwork", patterns: [/\b(weld|metalwork|steel fabrication)\w*\b/i] },
  { key: "glass", name: "Windows & Glass", patterns: [/\b(window glass|broken window|glaz|glass pane)\w*\b/i] },
  { key: "drywall", name: "Ceilings & Drywall", patterns: [/\b(ceiling|drywall|plasterboard)\w*\b/i] },
  { key: "flooring", name: "Flooring", patterns: [/\b(laminate floor|wooden floor|vinyl floor|flooring)\w*\b/i] },
  { key: "gutters", name: "Gutters", patterns: [/\b(gutter|downpipe)\w*\b/i] },
  { key: "solar", name: "Solar & Inverter", patterns: [/\b(solar panel|inverter|battery backup)\w*\b/i] },
  { key: "security", name: "CCTV & Security", patterns: [/\b(cctv|security camera|alarm system|intercom)\w*\b/i] },
  { key: "garage", name: "Gates & Garage Doors", patterns: [/\b(garage door|gate motor|electric gate|sliding gate)\w*\b/i] },
  { key: "pest", name: "Pest Control", patterns: [/\b(pest|cockroach|termite|bedbug|bed bug|rat infestation|ant infestation)\w*\b/i] },
  { key: "furniture", name: "Furniture Assembly", patterns: [/\b(flatpack|furniture assembly|assemble (?:a )?(?:bed|desk|table|wardrobe))\w*\b/i] },
  { key: "moving", name: "Small Moves & Heavy Lifting", patterns: [/\b(move furniture|heavy lifting|small move|move (?:a )?(?:sofa|couch|bed|fridge))\w*\b/i] },
];

function firstSupportedCandidate(value: string): ServiceCandidate | null {
  for (const service of services) {
    if (service.patterns.some((pattern) => pattern.test(value))) {
      return { key: service.key, name: service.name };
    }
  }
  return null;
}

function hasMultipleTradeClauses(value: string): boolean {
  const clauses = value
    .split(/(?:\b(?:and|also|plus)\b|[;,])/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
  if (clauses.length < 2) return false;
  const keys = new Set<string>();
  for (const clause of clauses) {
    const candidate = firstSupportedCandidate(clause);
    if (candidate) keys.add(candidate.key);
    if (keys.size > 1) return true;
  }
  return false;
}

export function classifyService(description: string): ServiceClassification {
  const value = normalizeServiceTypos(description.trim());
  if (prohibitedPatterns.some((pattern) => pattern.test(value))) {
    return { scope: "unsupported", candidate: null };
  }
  if (outOfScopePatterns.some((pattern) => pattern.test(value))) {
    return { scope: "unsupported", candidate: null };
  }
  // A WhatsApp message may contain several separate household jobs. Do not
  // silently select the first trade: ask the customer to clarify/split it so
  // matching remains accurate. Phrase-level overlaps inside one clause (for
  // example "electric gate") are intentionally left to the normal classifier.
  if (hasMultipleTradeClauses(value)) {
    return { scope: "unclear", candidate: null };
  }
  const candidate = firstSupportedCandidate(value);
  if (candidate) return { scope: "supported", candidate };
  return { scope: "unclear", candidate: null };
}

export function serviceScope(description: string) {
  return classifyService(description).scope;
}

export function serviceConfirmationReply(candidate: ServiceCandidate) {
  return {
    handled: true,
    reply: `This looks like a ${candidate.name} request. Is that correct?`,
    ui: {
      type: "buttons",
      body: `Confirm service: ${candidate.name}`,
      buttons: [
        { id: "CONFIRM_SERVICE", title: `Yes, ${candidate.name}`.slice(0, 20) },
        { id: "CHANGE_SERVICE", title: "Choose another" },
        { id: "JI_CANCEL", title: "Cancel" },
      ],
    },
  };
}

export const unsupportedServiceReply = {
  handled: true,
  reply:
    "HandyConnect is only for supported home repair and maintenance services. This request can’t be sent to handymen. Describe a household repair instead, or choose Cancel.",
  ui: {
    type: "buttons",
    body: "What would you like to do?",
    buttons: [
      { id: "REQUEST_HELP", title: "Try another request" },
      { id: "JI_CANCEL", title: "Cancel" },
      { id: "HOME", title: "Home" },
    ],
  },
};

export const unclearServiceReply = {
  handled: true,
  reply:
    "I couldn’t identify one supported home service yet. If you need more than one trade, send each job separately—for example, first ‘leaking toilet’, then create another request for ‘broken socket’.",
};
