// Phase 372B — an amount in cents, for an invoice or a payment.
//
// Only amounts the shop is owed or was paid: the app shows no plan
// price anywhere (Stripe's own pages do).

export function formatMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  const code = currency.trim().toUpperCase();
  return code === 'USD' ? `$${amount}` : `${amount} ${code}`;
}
