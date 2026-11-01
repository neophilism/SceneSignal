# SS-29 — Private settlement and neutral impact preview

`SessionSettlementPreview` accepts a single already-verified snapshot from a
trusted, server-side verifier. It refuses self-reported browser payments,
unapproved expenses, malformed receipts, scope changes, stale snapshots,
duplicates and out-of-range totals. The organizer alone can inspect the
private report. It reconciles gross receipts by artist and approved costs,
with an explicit net-before-distribution figure that may be negative.

A contribution fact is a separate bounded observed-seconds tally. It is
NOT a payout, revenue share, audience ranking or evidence of a right to
compensation. The report deliberately omits private contributor IDs,
transaction IDs and payer data. It always declares distributionExecuted=false
and fieldValidated=false. No bank transfers, Stripe captures, refunds, tax
calculations or rights allocations are made in this module.

Production reconciliation needs the approved SS-28 and SS-24 dependencies,
real merchant/provider verification including reversals, verified invoices,
the licensed artist-rights agreement, persistent accounting, human-authorized
payout policy and audited settlement. The fixture verifier in tests is not
actual financial evidence. Do not use this preview to pay artists.
