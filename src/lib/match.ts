import type { Selected } from "./balance";

/** Khóa nhận diện một kèo dựa trên thành phần 2 đội (không phân biệt A/B, thứ tự). */
export function rosterKey(
  teamA: Pick<Selected, "name">[],
  teamB: Pick<Selected, "name">[]
): string {
  const norm = (t: Pick<Selected, "name">[]) =>
    t.map((p) => p.name).sort().join("|");
  return [norm(teamA), norm(teamB)].sort().join("###");
}
