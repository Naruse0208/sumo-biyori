const GLICKO_SCALE = 173.7178;

const clampProbability = (value: number) => Math.min(0.95, Math.max(0.05, value));
const logistic = (value: number) => 1 / (1 + Math.exp(-value));
const logit = (value: number) => Math.log(value / (1 - value));

export function calibrateProbability(probability: number, slope = 1) {
  return clampProbability(logistic(slope * logit(clampProbability(probability))));
}

export function eloProbability(firstRating: number, secondRating: number) {
  return 1 / (1 + 10 ** ((secondRating - firstRating) / 400));
}

export function symmetricGlickoProbability(
  first: { rating: number; rd: number },
  second: { rating: number; rd: number },
) {
  const ratingDifference = (first.rating - second.rating) / GLICKO_SCALE;
  const combinedPhi = Math.sqrt(first.rd ** 2 + second.rd ** 2) / GLICKO_SCALE;
  const attenuation = 1 / Math.sqrt(1 + (3 * combinedPhi ** 2) / Math.PI ** 2);
  return logistic(attenuation * ratingDifference);
}

export function dohyoPredictionV2(baseProbability: number, matchupResidual: number, calibrationSlope = 1) {
  const matchupLogit = 1.78 * matchupResidual;
  const rawProbability = clampProbability(logistic(logit(baseProbability) + matchupLogit));
  return {
    probability: calibrateProbability(rawProbability, calibrationSlope),
    rawProbability,
    matchupLogit,
  };
}

export function dohyoPredictionV3(
  baseProbability: number,
  features: number[],
  weights: number[],
) {
  const featureLogit = features.reduce(
    (sum, feature, index) => sum + feature * (weights[index] ?? 0),
    0,
  );
  return {
    probability: clampProbability(logistic(logit(baseProbability) + featureLogit)),
    featureLogit,
  };
}

export function predictionConfidence(firstRd: number, secondRd: number) {
  const combined = Math.sqrt(firstRd ** 2 + secondRd ** 2);
  if (combined <= 130) return "high" as const;
  if (combined <= 240) return "medium" as const;
  return "low" as const;
}
