export const LOCATOR_RANK = {
  ax: 1,
  text: 2,
  image: 3,
  css: 4,
  url: 5,
  position: 99
};

export function rankLocators(locator) {
  const candidates = [locator?.primary, ...(locator?.fallbacks ?? [])].filter(Boolean);
  return candidates.sort((a, b) => (LOCATOR_RANK[a.kind] ?? 50) - (LOCATOR_RANK[b.kind] ?? 50));
}

export function hasPositionOnlyLocator(step) {
  const candidates = [step.target?.primary, ...(step.target?.fallbacks ?? [])].filter(Boolean);
  return candidates.length > 0 && candidates.every((candidate) => candidate.kind === "position");
}
