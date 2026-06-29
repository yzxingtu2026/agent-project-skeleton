const path = require("path");
const { GENERATED_NOTICE } = require("./constants");
const { toFrontmatter } = require("./frontmatter");
const { readSimpleYaml } = require("./simple-yaml");

function renderAll(repo, targets) {
  const outputs = [];
  const rulesConfig = repo.readJson(".agent/adapters/rules.json");
  const skillsConfig = repo.readJson(".agent/adapters/skills.json");

  for (const rule of rulesConfig.rules) {
    const source = repo.readText(rule.source).trimEnd() + "\n";
    if (targets.has("qoder") && rule.qoder) outputs.push(renderRule(rule.qoder.path, rule.qoder.frontmatter, source));
    if (targets.has("cursor") && rule.cursor) outputs.push(renderRule(rule.cursor.path, rule.cursor.frontmatter, source));
  }

  for (const skill of skillsConfig.skills) {
    if (targets.has("qoder") && skill.qoder) outputs.push(renderQoderSkill(repo, skill));
  }

  return outputs;
}

function renderRule(outputPath, frontmatter, body) {
  return {
    path: outputPath,
    content: toFrontmatter(frontmatter) + GENERATED_NOTICE + body,
  };
}

function renderQoderSkill(repo, skill) {
  const skillDir = skill.source;
  const meta = readSimpleYaml(repo, path.join(skillDir, "skill.yml"));
  const instructions = repo.readText(path.join(skillDir, "instructions.md")).trimEnd() + "\n";
  const frontmatter = toFrontmatter({
    name: meta.id,
    description: meta.description,
  });
  return {
    path: skill.qoder.path,
    content: frontmatter + GENERATED_NOTICE + instructions,
  };
}

module.exports = {
  renderAll,
};
