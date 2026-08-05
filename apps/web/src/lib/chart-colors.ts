const validHex = /^#[0-9a-f]{6}$/i;

function color(value: string | null | undefined, fallback: string) {
  return value && validHex.test(value) ? value.toUpperCase() : fallback;
}

function mix(left: string, right: string, rightWeight: number) {
  const channel = (hex: string, offset: number) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16);
  const mixed = [1, 3, 5].map((offset) =>
    Math.round(channel(left, offset) * (1 - rightWeight) + channel(right, offset) * rightWeight)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${mixed.join("")}`.toUpperCase();
}

export function brandChartPalette(primary?: string | null, accent?: string | null) {
  const base = color(primary, "#0D2926");
  const highlight = color(accent, "#B8F39A");
  return [
    base,
    highlight,
    mix(base, highlight, 0.32),
    mix(base, "#FFFFFF", 0.28),
    mix(highlight, base, 0.28),
    mix(base, "#000000", 0.2),
    mix(highlight, "#FFFFFF", 0.28),
    mix(base, highlight, 0.65),
  ] as const;
}
