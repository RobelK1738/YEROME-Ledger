/** Itemize the existing package. These lines explain totals; they never add a second expense. */
export function costBreakdown({ totalCents, jobCount, apartmentCents, actual = false, referred = false }) {
  if (totalCents == null) return [];
  const lines = [
    { key: 'worker', label: 'Worker wages', perJobCents: actual ? 20000 : 40000, monthlyCents: jobCount * (actual ? 20000 : 40000) },
    { key: 'apartment', label: 'Rent, Wi-Fi & VPN', monthlyCents: apartmentCents },
    { key: 'management', label: 'Management & HR', perJobCents: actual ? 10000 : 40000, monthlyCents: jobCount * (actual ? 10000 : 40000) },
    { key: 'transport', label: 'Transportation', perJobCents: actual ? 5000 : 10000, monthlyCents: jobCount * (actual ? 5000 : 10000) },
    { key: 'misc', label: 'Miscellaneous', perJobCents: 5000, monthlyCents: jobCount * 5000 },
  ];
  if (!actual && referred) lines.push({ key: 'referral', label: 'Referral service', perJobCents: 20000, monthlyCents: jobCount * 20000 });
  const remainder = totalCents - lines.reduce((sum, line) => sum + line.monthlyCents, 0);
  if (remainder) lines.push({ key: 'adjustment', label: 'Package adjustment', monthlyCents: remainder });
  return lines;
}
