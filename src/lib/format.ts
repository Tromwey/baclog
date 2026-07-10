/** Zero-pad a count to 2 digits ("03") — the mono index/count treatment. */
export const pad = (n: number) => String(n).padStart(2, "0");
