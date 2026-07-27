const moneyPattern = /^(0|[1-9][0-9]{0,14})(?:\.([0-9]{1,4}))?$/;
const costPattern = /^(0|[1-9][0-9]{0,14})(?:\.([0-9]{1,6}))?$/;

function parseScaled(value: string, scale: number, pattern: RegExp, field: string) {
  const normalized = value.trim();
  const match = pattern.exec(normalized);
  if (!match) {
    throw new Error(`${field} must be a non-negative decimal with at most ${scale} places`);
  }
  const fraction = (match[2] ?? "").padEnd(scale, "0");
  return BigInt(match[1]!) * 10n ** BigInt(scale) + BigInt(fraction || "0");
}

function formatScaled(value: bigint, scale: number) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function parseMoney(value: string, field = "amount") {
  return parseScaled(value, 4, moneyPattern, field);
}

export function formatMoney(value: bigint) {
  return formatScaled(value, 4);
}

export function parseUnitCost(value: string) {
  return parseScaled(value, 6, costPattern, "unit cost");
}

export function formatUnitCost(value: bigint) {
  return formatScaled(value, 6);
}

export function decimalToMoney(value: { toFixed(decimalPlaces: number): string }) {
  return parseMoney(value.toFixed(4));
}

export function decimalToUnitCost(value: { toFixed(decimalPlaces: number): string }) {
  return parseUnitCost(value.toFixed(6));
}
