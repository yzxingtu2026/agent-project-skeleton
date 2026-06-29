const { readTeamMembers, readTeamRoles } = require("./team");

function validateSources(repo) {
  validateTeamMembers(repo);
  validateTeamRoles(repo);
}

function validateTeamMembers(repo) {
  const membersPath = ".agent/team/members.yml";
  const members = readTeamMembers(repo);
  const entries = Object.entries(members);
  if (!entries.length) throw new Error(`${membersPath} 至少需要定义一名团队成员`);

  for (const [key, member] of entries) {
    const github = member.github || {};
    if (!member.name) throw new Error(`${membersPath}: ${key}.name 不能为空`);
    if (!member.role) throw new Error(`${membersPath}: ${key}.role 不能为空`);
    if (!github.username) throw new Error(`${membersPath}: ${key}.github.username 不能为空`);
    if (!github.email) throw new Error(`${membersPath}: ${key}.github.email 不能为空`);
  }
}

function validateTeamRoles(repo) {
  const rolesPath = ".agent/team/roles.yml";
  const roles = readTeamRoles(repo).roles || {};
  if (!Object.keys(roles).length) throw new Error(`${rolesPath} 至少需要定义一个团队角色`);
  for (const [key, role] of Object.entries(roles)) {
    if (!role.title) throw new Error(`${rolesPath}: ${key}.title 不能为空`);
  }
}

module.exports = {
  validateSources,
};
