export function predictionRecordId(
  bashoId: number,
  day: number,
  division: number,
  firstNskId: number,
  secondNskId: number,
) {
  const low = Math.min(firstNskId, secondNskId);
  const high = Math.max(firstNskId, secondNskId);
  return `${bashoId}-${day}-${division}-${low}-${high}`;
}

export function validPredictionContext(values: number[]) {
  return values.every((value) => Number.isInteger(value) && value > 0);
}
