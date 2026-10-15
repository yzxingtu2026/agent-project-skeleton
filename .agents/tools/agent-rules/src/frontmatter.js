function toFrontmatter(frontmatter) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter || {})) {
    if (typeof value === "boolean") lines.push(`${key}: ${value}`);
    else lines.push(`${key}: ${quoteYamlScalar(String(value))}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function quoteYamlScalar(value) {
  if (/^[a-zA-Z0-9_-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

module.exports = {
  toFrontmatter,
};
