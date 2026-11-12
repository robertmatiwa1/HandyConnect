import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function qualify(prospect) {
  const sectors = new Set(['property_management', 'letting_agency', 'estate_agency', 'facilities_management']);
  const reasons = [];
  if (sectors.has(prospect.sector)) reasons.push('recurring-property-maintenance-fit');
  if (prospect.maintenanceNeed === true) reasons.push('reported-maintenance-need');
  if (typeof prospect.serviceArea === 'string' && prospect.serviceArea !== 'Unknown') reasons.push('service-area-recorded');
  const score = reasons.length;
  return {
    business: prospect.business,
    score,
    reasons,
    qualifiedForReview: score >= 2,
    outreachAllowed: false,
    status: 'research_only',
    permissionRecorded: prospect.contactPermission === 'consented',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = process.argv[2];
  if (!path) throw new Error('Provide a local JSON input path');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data)) throw new Error('Input must be a JSON array');
  process.stdout.write(JSON.stringify(data.map(qualify), null, 2) + '\n');
}
