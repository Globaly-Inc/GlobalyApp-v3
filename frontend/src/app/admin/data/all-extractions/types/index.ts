// UI-only types for the all-extractions feature. Wire types live in apis/types.ts.

/** One {fee type, amount} row inside a fee installment, as the fee form holds it — amounts
 *  stay strings while the field is being typed and are coerced on submit. */
export type FeeLine = { fee_type: string; amount: string };

/** One installment in the fee form: a label plus its fee-type lines. */
export type FeeFormInstallment = { label: string; lines: FeeLine[] };
