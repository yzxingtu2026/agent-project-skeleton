function readSimpleYaml(repo, relativePath) {
  const lines = repo.readText(relativePath).split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, value: root, parent: null, key: null }];

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const indent = rawLine.match(/^ */)[0].length;
    const line = rawLine.trim();

    const listMatch = /^-\s+(.*)$/.exec(line);
    if (listMatch) {
      while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
      const current = stack[stack.length - 1];
      if (!Array.isArray(current.value)) {
        if (!current.parent || !current.key) throw new Error(`${relativePath}: 列表项缺少父级字段`);
        current.parent[current.key] = [];
        current.value = current.parent[current.key];
      }
      current.value.push(parseSimpleYamlValue(listMatch[1].trim()));
      continue;
    }

    const match = /^([^:]+):(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].trim();
    const rawValue = match[2].trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;

    if (!rawValue) {
      parent[key] = {};
      stack.push({ indent, value: parent[key], parent, key });
    } else {
      parent[key] = parseSimpleYamlValue(rawValue);
    }
  }

  return root;
}

function parseSimpleYamlValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

module.exports = {
  readSimpleYaml,
};
