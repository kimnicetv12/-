// Tyre-on-surface friction characteristics. These already include the tyre
// you'd fit for that stage (tarmac slicks/cut tarmac tyres, gravel tyres,
// studded Nordic snow tyres).
//
//   mu      peak friction coefficient at nominal load
//   kPeak   longitudinal slip ratio at peak force
//   aPeak   slip angle at peak lateral force (degrees)
//   fall    fraction of peak force left when fully sliding
//   rr      rolling resistance coefficient
//   drag    extra "ploughing" drag through loose material (N per m/s per kN load)
//   rough   bumpiness amplitude for camera/audio/suspension noise

export const SURFACES = {
  tarmac: { id: 'tarmac', label: '아스팔트', mu: 1.16, kPeak: 0.1, aPeak: 7.0, fall: 0.78, rr: 0.012, drag: 0, rough: 0.0 },
  ice: { id: 'ice', label: '빙판', mu: 0.3, kPeak: 0.08, aPeak: 5.0, fall: 0.75, rr: 0.012, drag: 0, rough: 0.0 },
  tarmacDirty: { id: 'tarmacDirty', label: '모래 낀 아스팔트', mu: 0.92, kPeak: 0.11, aPeak: 7.5, fall: 0.8, rr: 0.016, drag: 0, rough: 0.2 },
  gravel: { id: 'gravel', label: '자갈', mu: 0.84, kPeak: 0.16, aPeak: 10.5, fall: 0.9, rr: 0.026, drag: 0, rough: 0.5 },
  gravelLoose: { id: 'gravelLoose', label: '느슨한 자갈', mu: 0.7, kPeak: 0.2, aPeak: 13, fall: 0.93, rr: 0.05, drag: 0.12, rough: 0.8 },
  snow: { id: 'snow', label: '압설', mu: 0.6, kPeak: 0.16, aPeak: 11, fall: 0.88, rr: 0.03, drag: 0, rough: 0.35 },
  snowDeep: { id: 'snowDeep', label: '깊은 눈', mu: 0.42, kPeak: 0.3, aPeak: 16, fall: 0.95, rr: 0.11, drag: 0.55, rough: 0.6 },
  grass: { id: 'grass', label: '풀밭', mu: 0.58, kPeak: 0.15, aPeak: 10, fall: 0.82, rr: 0.07, drag: 0.15, rough: 1.0 },
  dirt: { id: 'dirt', label: '흙', mu: 0.68, kPeak: 0.18, aPeak: 12, fall: 0.9, rr: 0.06, drag: 0.1, rough: 1.0 },
};

for (const s of Object.values(SURFACES)) s.tanAPeak = Math.tan((s.aPeak * Math.PI) / 180);

/** Which surface each stage type uses on the road / shoulder / off-road. */
export const STAGE_SURFACES = {
  tarmac: { road: 'tarmac', shoulder: 'tarmacDirty', off: 'dirt' },
  gravel: { road: 'gravel', shoulder: 'gravelLoose', off: 'grass' },
  snow: { road: 'snow', shoulder: 'snowDeep', off: 'snowDeep' },
};
