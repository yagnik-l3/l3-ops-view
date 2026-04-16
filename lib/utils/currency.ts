/**
 * Format a number as Indian Rupee with lakhs notation.
 * e.g. 150000 → ₹1.5L, 2500000 → ₹25L, 500 → ₹500
 */
export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined) return '₹0'

  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(3)}Cr`
  }
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)}L`
  }
  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(2)}K`
  }
  return `₹${value.toFixed(0)}`
}

export function formatINRFull(value: number | null | undefined): string {
  if (value === null || value === undefined) return '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}
