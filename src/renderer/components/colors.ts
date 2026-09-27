/** Temperature (°C) → color. Cold blue → optimal green → hot amber → overheat red. */
export function tireTempColor(c: number): string {
  const stops: [number, [number, number, number]][] = [
    // FH6 tires run cool (≈20–60 °C observed), so the scale is centred there
    [15, [70, 120, 255]],
    [28, [45, 226, 230]],
    [42, [59, 220, 132]],
    [62, [255, 197, 61]],
    [85, [255, 77, 94]],
  ];
  if (c <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const [c0, a] = stops[i - 1];
      const [c1, b] = stops[i];
      const k = (c - c0) / (c1 - c0);
      return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',')})`;
    }
  }
  return `rgb(${stops.at(-1)![1].join(',')})`;
}
