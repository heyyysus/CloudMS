// Standard coverage limit / deductible options offered in the policy
// coverage dropdowns. The selected label is stored verbatim as the coverage
// value (backend columns are free-text), so these arrays double as the set
// of "known" values — anything else found on an existing policy is treated
// as a legacy value and preserved as-is by the coverage select.

// Bodily injury limits, shared by BI and UM/BI.
export const BI_LIMITS = [
  '30/60',
  '50/100',
  '100/300',
  '250/500',
  '500/1M',
  '1M/1M',
  '500 CSL',
  '1M CSL',
]

export const PD_LIMITS = ['15', '25', '50', '100', '250', '500']

export const MEDPAY_LIMITS = ['500', '1,000', '2,500', '5,000', '10,000', '25,000', '50,000']

export const UMPD_LIMITS = ['3.5']

// Deductibles, shared by Collision and Comprehensive (and thus CDW, which
// mirrors the selected Collision deductible).
export const DEDUCTIBLES = ['100', '250', '500', '750', '1,000', '1,500', '2,500', '5,000']

export const RENTAL_LIMITS = ['20/600', '30/900', '40/1200', '50/1500', '60/1800']

export const TOWING_LIMITS = ['50', '100', '150']
