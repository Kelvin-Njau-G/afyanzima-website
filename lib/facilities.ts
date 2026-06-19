import crypto from 'crypto';

export type FacilityConfig = {
  name: string;
  passwordHash: string; // SHA-256 of the facility's password
};

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Add / remove facilities here. Change a password by updating the string inside sha256().
export const FACILITIES: Record<string, FacilityConfig> = {
  qaalane: {
    name: 'Qaalane Pharmacy and Medical Centre',
    passwordHash: sha256('qaalane2026'),
  },
  'city-star': {
    name: 'City Star Hospital',
    passwordHash: sha256('citystar2026'),
  },
  healmerc: {
    name: 'Healmerc Pharmacy Limited',
    passwordHash: sha256('healmerc2026'),
  },
  libken: {
    name: 'Libken Medical Centre Limited',
    passwordHash: sha256('libken2026'),
  },
  'pcea-st-timothy': {
    name: 'PCEA St Timothy Medical Centre Limited',
    passwordHash: sha256('pcea2026'),
  },
  'well-living': {
    name: 'Well Living Medical Clinic',
    passwordHash: sha256('wellliving2026'),
  },
};

export const DASHBOARD_PASSWORD_HASH = sha256('paas-dashboard2026');

export function checkPassword(slug: string, password: string): boolean {
  const facility = FACILITIES[slug];
  if (!facility) return false;
  return sha256(password) === facility.passwordHash;
}

export function checkDashboardPassword(password: string): boolean {
  return sha256(password) === DASHBOARD_PASSWORD_HASH;
}
