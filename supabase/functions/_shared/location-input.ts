export type ParsedLocation = {
  raw: string;
  suburb: string;
  city: string | null;
  province: string | null;
  needsCity: boolean;
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const title = (value: string) => clean(value).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

const CITY_ALIASES: Array<[RegExp, string]> = [
  [/\bcape\s*town\b/i, "Cape Town"],
  [/\bcapetown\b/i, "Cape Town"],
  [/\bjoburg\b/i, "Johannesburg"],
  [/\bjohannesburg\b/i, "Johannesburg"],
  [/\bpretoria\b/i, "Pretoria"],
  [/\bdurban\b/i, "Durban"],
];

const PROVINCE_ALIASES: Array<[RegExp, string]> = [
  [/\bwestern\s*cape\b/i, "Western Cape"],
  [/\bgauteng\b/i, "Gauteng"],
  [/\bkwazulu[ -]?natal\b|\bkzn\b/i, "KwaZulu-Natal"],
  [/\beastern\s*cape\b/i, "Eastern Cape"],
  [/\bfree\s*state\b/i, "Free State"],
  [/\blimpopo\b/i, "Limpopo"],
  [/\bmpumalanga\b/i, "Mpumalanga"],
  [/\bnorth\s*west\b/i, "North West"],
  [/\bnorthern\s*cape\b/i, "Northern Cape"],
];

const CAPE_TOWN_SUBURBS = new Set([
  "claremont", "constantia", "langa", "bellville", "pinelands", "rondebosch",
  "newlands", "kenilworth", "wynberg", "observatory", "woodstock", "milnerton",
  "table view", "plumstead", "retreat", "mitchells plain", "khayelitsha",
  "gugulethu", "nyanga", "parow", "goodwood", "durbanville", "brackenfell",
  "kuils river", "somerset west", "strand", "fish hoek", "muizenberg"
]);

export function parseHumanLocation(input: string): ParsedLocation | null {
  const raw = clean(input);
  if (raw.length < 2) return null;

  const commaParts = raw.split(",").map(clean).filter(Boolean);
  if (commaParts.length >= 2) {
    const suburb = title(commaParts[0]);
    const city = normalizeCity(commaParts[1]);
    const province = commaParts[2] ? normalizeProvince(commaParts[2]) : inferProvince(city);
    return { raw, suburb, city, province, needsCity: false };
  }

  let working = raw;
  let city: string | null = null;
  for (const [pattern, canonical] of CITY_ALIASES) {
    if (pattern.test(working)) {
      city = canonical;
      working = clean(working.replace(pattern, " "));
      break;
    }
  }
  let province: string | null = null;
  for (const [pattern, canonical] of PROVINCE_ALIASES) {
    if (pattern.test(working)) {
      province = canonical;
      working = clean(working.replace(pattern, " "));
      break;
    }
  }

  const suburb = title(working || raw);
  if (!city && CAPE_TOWN_SUBURBS.has(suburb.toLowerCase())) city = "Cape Town";
  if (!province) province = inferProvince(city);
  return { raw, suburb, city, province, needsCity: !city };
}

export function normalizeCity(value: string): string {
  for (const [pattern, canonical] of CITY_ALIASES) if (pattern.test(value)) return canonical;
  return title(value);
}

export function normalizeProvince(value: string): string {
  for (const [pattern, canonical] of PROVINCE_ALIASES) if (pattern.test(value)) return canonical;
  return title(value);
}

function inferProvince(city: string | null): string | null {
  if (city === "Cape Town") return "Western Cape";
  if (["Johannesburg", "Pretoria"].includes(city || "")) return "Gauteng";
  if (city === "Durban") return "KwaZulu-Natal";
  return null;
}
