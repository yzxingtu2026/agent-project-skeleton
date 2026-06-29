const { readSimpleYaml } = require("./simple-yaml");

function readTeamMembers(repo) {
  return readSimpleYaml(repo, ".agent/team/members.yml").members || {};
}

function readTeamRoles(repo) {
  return readSimpleYaml(repo, ".agent/team/roles.yml");
}

function findTeamMember(repo, profile) {
  const username = (profile.githubUsername || profile.githubUser || "").toLowerCase();
  const email = (profile.githubEmail || profile.email || "").toLowerCase();
  if (!username && !email) return null;

  for (const member of Object.values(readTeamMembers(repo))) {
    const github = member.github || {};
    if (username && String(github.username || "").toLowerCase() === username) return member;
    if (email && String(github.email || "").toLowerCase() === email) return member;
  }
  return null;
}

function renderRoleGuide(repo, roleName) {
  const role = getRole(repo, roleName);
  const title = role?.title || roleName;
  const sections = [`### ${title}`];
  if (role?.responsibilities?.length) sections.push(`- 职责：${role.responsibilities.join("；")}`);
  if (role?.permissions?.length) sections.push(`- 权限：${role.permissions.join("；")}`);
  if (role?.preferences?.length) sections.push(`- 协作偏好：${role.preferences.join("；")}`);
  if (sections.length === 1) {
    sections.push("- 职责：按当前 Issue/PR 约定执行。");
    sections.push("- 权限：遵循仓库规则和团队授权。");
    sections.push("- 协作偏好：不确定时先在 Issue/PR 中确认。");
  }
  return sections.join("\n");
}

function renderCommonConstraints(repo) {
  const constraints = readTeamRoles(repo).common_constraints || [];
  if (!constraints.length) return "- 遵循仓库默认分支、Issue/PR、测试和合并规则。";
  return constraints.map((item) => `- ${item}`).join("\n");
}

function getRole(repo, roleName) {
  const roles = readTeamRoles(repo).roles || {};
  return roles[roleName] || null;
}

module.exports = {
  findTeamMember,
  readTeamMembers,
  readTeamRoles,
  renderCommonConstraints,
  renderRoleGuide,
};
