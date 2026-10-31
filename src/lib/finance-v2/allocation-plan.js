export function validISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function allocationPlanDto(row) {
  if (!row) return null;
  return { nextFundDate: row.next_fund_date || null,
    instructions: row.instructions || '', updatedAt: row.updated_at || null };
}
