function renderTemplate(repo, templatePath, replacements) {
  let content = repo.readText(templatePath).trimEnd() + "\n";
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

module.exports = {
  renderTemplate,
};
