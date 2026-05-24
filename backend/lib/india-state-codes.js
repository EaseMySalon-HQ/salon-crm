/**
 * Mapping of Indian state / UT names → 2-digit GSTN state code.
 *
 * Used when assembling GSTR-1 JSON for upload, where `pos` must be the
 * numeric state code (e.g. "29" for Karnataka). Names are normalised
 * (lower-cased, hyphens/spaces stripped) so common variants resolve.
 */

'use strict';

const NAME_TO_CODE = {
  'jammuandkashmir': '01',
  'jandk': '01',
  'jammukashmir': '01',
  'himachalpradesh': '02',
  'punjab': '03',
  'chandigarh': '04',
  'uttarakhand': '05',
  'haryana': '06',
  'delhi': '07',
  'rajasthan': '08',
  'uttarpradesh': '09',
  'bihar': '10',
  'sikkim': '11',
  'arunachalpradesh': '12',
  'nagaland': '13',
  'manipur': '14',
  'mizoram': '15',
  'tripura': '16',
  'meghalaya': '17',
  'assam': '18',
  'westbengal': '19',
  'jharkhand': '20',
  'odisha': '21',
  'orissa': '21',
  'chhattisgarh': '22',
  'chattisgarh': '22',
  'madhyapradesh': '23',
  'gujarat': '24',
  'daman': '26',
  'damanandiu': '26',
  'dadraandnagarhaveli': '26',
  'dadranagarhaveli': '26',
  'dadraandnagarhaveliandanddamananddiu': '26',
  'maharashtra': '27',
  'andhrapradeshold': '28',
  'karnataka': '29',
  'goa': '30',
  'lakshadweep': '31',
  'kerala': '32',
  'tamilnadu': '33',
  'puducherry': '34',
  'pondicherry': '34',
  'andamanandnicobarislands': '35',
  'andamannicobar': '35',
  'andamannicobarislands': '35',
  'telangana': '36',
  'andhrapradesh': '37',
  'ladakh': '38',
  'othersorforeign': '97',
  'foreign': '97',
};

function normalise(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Return the 2-digit numeric state code, or `''` if not resolvable. */
function stateCode(stateOrCode) {
  const raw = String(stateOrCode || '').trim();
  if (!raw) return '';
  if (/^\d{1,2}$/.test(raw)) return raw.padStart(2, '0');
  const code = NAME_TO_CODE[normalise(raw)];
  return code || '';
}

module.exports = { stateCode };
