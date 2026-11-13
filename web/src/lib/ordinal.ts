/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st (and a sensible suffix even for 0 or a negative number). */
export function ordinal(n: number): string {
  const v = Math.round(n);
  const a = Math.abs(v);
  const suffix = a % 100 >= 11 && a % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][a % 10] ?? "th");
  return `${v}${suffix}`;
}
