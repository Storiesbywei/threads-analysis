/**
 * info-theory-lib.mjs — Pure information-theoretic functions
 *
 * Extracted from information-theory.mjs for testability.
 * All functions are stateless and side-effect-free.
 */

export function log2(x) { return x === 0 ? 0 : Math.log2(x); }

/** Shannon entropy H(X) = -Σ p(x) log2(p(x)) */
export function entropy(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of Object.values(counts)) {
    const p = c / total;
    if (p > 0) h -= p * log2(p);
  }
  return h;
}

/** Self-information (surprise) of a single event: -log2(p(x)) */
export function surprise(prob) { return prob > 0 ? -log2(prob) : Infinity; }

/** Normalized entropy: H(X) / log2(|X|) — 0 = deterministic, 1 = uniform */
export function normalizedEntropy(counts) {
  const n = Object.keys(counts).length;
  if (n <= 1) return 0;
  return entropy(counts) / log2(n);
}

/** Joint entropy H(X,Y) — alias for entropy on joint count table */
export function jointEntropy(jointCounts) { return entropy(jointCounts); }

/** Mutual information I(X;Y) = H(X) + H(Y) - H(X,Y) */
export function mutualInformation(xCounts, yCounts, jointCounts) {
  return entropy(xCounts) + entropy(yCounts) - jointEntropy(jointCounts);
}

/** Pointwise Mutual Information: log2(p(x,y) / (p(x) * p(y))) */
export function pmi(pX, pY, pXY) {
  if (pX === 0 || pY === 0 || pXY === 0) return 0;
  return log2(pXY / (pX * pY));
}

/** Normalized PMI: PMI / -log2(p(x,y)), bounded [-1, 1] */
export function npmi(pX, pY, pXY) {
  if (pX === 0 || pY === 0 || pXY === 0) return 0;
  const denom = -log2(pXY);
  if (denom === 0) return 0;
  return pmi(pX, pY, pXY) / denom;
}

/** Tokenize text → lowercase words, URLs stripped */
export function tokenize(text) {
  return text.toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b\w+\.\w{2,}\/\S*/g, ' ')
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}
