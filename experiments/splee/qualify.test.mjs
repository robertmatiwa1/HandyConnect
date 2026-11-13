import test from 'node:test';
import assert from 'node:assert/strict';
import { qualify } from './qualify.mjs';

test('property manager is qualified for review, never outreach', () => {
  const result = qualify({business:'Synthetic PM',sector:'property_management',maintenanceNeed:true,serviceArea:'Johannesburg',contactPermission:'consented'});
  assert.equal(result.qualifiedForReview,true);
  assert.equal(result.outreachAllowed,false);
  assert.equal(result.status,'research_only');
});

test('public contact without permission never enables outreach', () => {
  const result = qualify({business:'Synthetic Agency',sector:'estate_agency',maintenanceNeed:true,serviceArea:'Potchefstroom',contactPermission:'unknown'});
  assert.equal(result.permissionRecorded,false);
  assert.equal(result.outreachAllowed,false);
});

test('irrelevant prospect not qualified', () => {
  const result = qualify({business:'Synthetic Shop',sector:'retail',maintenanceNeed:false,serviceArea:'Unknown'});
  assert.equal(result.qualifiedForReview,false);
});
