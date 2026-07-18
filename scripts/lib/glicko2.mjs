export const GLICKO2_DEFAULTS = Object.freeze({
  rating: 1500,
  rd: 350,
  volatility: 0.06,
  tau: 0.5,
  epsilon: 0.000001,
});

const SCALE = 173.7178;

const toMu = (rating) => (rating - 1500) / SCALE;
const toPhi = (rd) => rd / SCALE;
const fromMu = (mu) => 1500 + SCALE * mu;
const fromPhi = (phi) => SCALE * phi;
const g = (phi) => 1 / Math.sqrt(1 + (3 * phi ** 2) / Math.PI ** 2);
const expectation = (mu, opponentMu, opponentPhi) =>
  1 / (1 + Math.exp(-g(opponentPhi) * (mu - opponentMu)));

function nextVolatility(phi, sigma, variance, delta, tau, epsilon) {
  const a = Math.log(sigma ** 2);
  const f = (x) => {
    const exponential = Math.exp(x);
    const numerator = exponential * (delta ** 2 - phi ** 2 - variance - exponential);
    const denominator = 2 * (phi ** 2 + variance + exponential) ** 2;
    return numerator / denominator - (x - a) / tau ** 2;
  };

  let lower = a;
  let upper;
  if (delta ** 2 > phi ** 2 + variance) {
    upper = Math.log(delta ** 2 - phi ** 2 - variance);
  } else {
    let step = 1;
    upper = a - step * tau;
    while (f(upper) < 0) {
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
    } else {
      fLower /= 2;
    }
    upper = candidate;
    fUpper = fCandidate;
  }
  return Math.exp(lower / 2);
}

export function updateGlicko2(state, results, options = {}) {
  const tau = options.tau ?? GLICKO2_DEFAULTS.tau;
  const epsilon = options.epsilon ?? GLICKO2_DEFAULTS.epsilon;
  const mu = toMu(state.rating);
  const phi = toPhi(state.rd);
  const sigma = state.volatility;

  if (!results.length) {
    return {
      rating: state.rating,
      rd: fromPhi(Math.sqrt(phi ** 2 + sigma ** 2)),
      volatility: sigma,
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
  const volatility = nextVolatility(phi, sigma, variance, delta, tau, epsilon);
  const preRatingPhi = Math.sqrt(phi ** 2 + volatility ** 2);
  const nextPhi = 1 / Math.sqrt(1 / preRatingPhi ** 2 + 1 / variance);
  const nextMu = mu + nextPhi ** 2 * scoreSum;

  return {
    rating: fromMu(nextMu),
    rd: fromPhi(nextPhi),
    volatility,
  };
}

export function symmetricGlickoProbability(first, second) {
  const firstMu = toMu(first.rating);
  const secondMu = toMu(second.rating);
  const combinedPhi = Math.sqrt(toPhi(first.rd) ** 2 + toPhi(second.rd) ** 2);
  return 1 / (1 + Math.exp(-g(combinedPhi) * (firstMu - secondMu)));
}

export function glickoConfidence(rdFirst, rdSecond) {
  const combined = Math.sqrt(rdFirst ** 2 + rdSecond ** 2);
  if (combined <= 130) return "high";
  if (combined <= 240) return "medium";
  return "low";
}
