export const GLICKO2_DEFAULTS = Object.freeze({
  rating: 1500,
  rd: 350,
  volatility: 0.06,
  tau: 0.5,
  epsilon: 0.000001,
});

export type GlickoState = { rating: number; rd: number; volatility: number };
export type GlickoResult = { opponentRating: number; opponentRd: number; score: number };

const SCALE = 173.7178;
const toMu = (rating: number) => (rating - 1500) / SCALE;
const toPhi = (rd: number) => rd / SCALE;
const fromMu = (mu: number) => 1500 + SCALE * mu;
const fromPhi = (phi: number) => SCALE * phi;
const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi ** 2) / Math.PI ** 2);

function expectation(mu: number, opponentMu: number, opponentPhi: number) {
  return 1 / (1 + Math.exp(-g(opponentPhi) * (mu - opponentMu)));
}

function nextVolatility(
  phi: number,
  sigma: number,
  variance: number,
  delta: number,
  tau: number,
  epsilon: number,
) {
  const a = Math.log(sigma ** 2);
  const f = (x: number) => {
    const exponential = Math.exp(x);
    const numerator = exponential * (delta ** 2 - phi ** 2 - variance - exponential);
    const denominator = 2 * (phi ** 2 + variance + exponential) ** 2;
    return numerator / denominator - (x - a) / tau ** 2;
  };
  let lower = a;
  let upper: number;
  if (delta ** 2 > phi ** 2 + variance) upper = Math.log(delta ** 2 - phi ** 2 - variance);
  else {
    let step = 1;
    upper = a - step * tau;
    while (f(upper) < 0 && step < 100) {
      step += 1;
      upper = a - step * tau;
    }
  }
  let fLower = f(lower);
  let fUpper = f(upper);
  while (Math.abs(upper - lower) > epsilon) {
    const candidate = lower + ((lower - upper) * fLower) / (fUpper - fLower);
    const fCandidate = f(candidate);
    if (fCandidate * fUpper < 0) {
      lower = upper;
      fLower = fUpper;
    } else fLower /= 2;
    upper = candidate;
    fUpper = fCandidate;
  }
  return Math.exp(lower / 2);
}

export function updateGlicko2(state: GlickoState, results: GlickoResult[]): GlickoState {
  const mu = toMu(state.rating);
  const phi = toPhi(state.rd);
  if (!results.length) {
    return {
      rating: state.rating,
      rd: Math.min(GLICKO2_DEFAULTS.rd, fromPhi(Math.sqrt(phi ** 2 + state.volatility ** 2))),
      volatility: state.volatility,
    };
  }
  const converted = results.map((result) => ({
    opponentMu: toMu(result.opponentRating),
    opponentPhi: toPhi(result.opponentRd),
    score: result.score,
  }));
  const inverseVariance = converted.reduce((total, result) => {
    const expected = expectation(mu, result.opponentMu, result.opponentPhi);
    return total + g(result.opponentPhi) ** 2 * expected * (1 - expected);
  }, 0);
  const variance = 1 / inverseVariance;
  const scoreSum = converted.reduce((total, result) => {
    const expected = expectation(mu, result.opponentMu, result.opponentPhi);
    return total + g(result.opponentPhi) * (result.score - expected);
  }, 0);
  const delta = variance * scoreSum;
  const volatility = nextVolatility(
    phi,
    state.volatility,
    variance,
    delta,
    GLICKO2_DEFAULTS.tau,
    GLICKO2_DEFAULTS.epsilon,
  );
  const preRatingPhi = Math.sqrt(phi ** 2 + volatility ** 2);
  const nextPhi = 1 / Math.sqrt(1 / preRatingPhi ** 2 + 1 / variance);
  const nextMu = mu + nextPhi ** 2 * scoreSum;
  return {
    rating: fromMu(nextMu),
    rd: Math.min(GLICKO2_DEFAULTS.rd, fromPhi(nextPhi)),
    volatility,
  };
}
