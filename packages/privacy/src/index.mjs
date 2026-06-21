const SECRET_PATTERNS = [
  { name: "password", pattern: /password|passwd|pwd/i },
  { name: "api_key", pattern: /\b(?:sk-[A-Za-z0-9_-]{12,}|api[_-]?key)\b/i },
  { name: "token", pattern: /\b(?:token|bearer\s+[A-Za-z0-9._-]+)\b/i },
  { name: "otp", pattern: /\b\d{6}\b/ }
];

export function redactionPreview(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const candidates = [];
  for (const rule of SECRET_PATTERNS) {
    if (rule.pattern.test(text)) {
      candidates.push({
        kind: rule.name,
        reason: `Matched ${rule.name} pattern`,
        replacement: `{{${rule.name.toUpperCase()}}}`
      });
    }
  }
  return {
    sensitive: candidates.length > 0,
    candidates
  };
}
