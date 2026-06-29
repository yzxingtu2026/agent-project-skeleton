const { readTeamMembers, readTeamRoles } = require("./team");

function validateSources(repo) {
  validateTeamMembers(repo);
  validateTeamRoles(repo);
}

function validateTeamMembers(repo) {
  const membersPath = ".agent/team/members.yml";
  const members = readTeamMembers(repo);
  const entries = Object.entries(members);
  if (!entries.length) throw new Error(`${membersPath} must define at least one member`);

  for (const [key, member] of entries) {
    const github = member.github || {};
    if (!member.name) throw new Error(`${membersPath}: ${key}.name is required`);
    if (!member.role) throw new Error(`${membersPath}: ${key}.role is required`);
    if (!github.username) throw new Error(`${membersPath}: ${key}.github.username is required`);
    if (!github.email) throw new Error(`${membersPath}: ${key}.github.email is required`);
  }
}

function validateTeamRoles(repo) {
  const rolesPath = ".agent/team/roles.yml";
  const roles = readTeamRoles(repo).roles || {};
  if (!Object.keys(roles).length) throw new Error(`${rolesPath} must define at least one role`);
  for (const [key, role] of Object.entries(roles)) {
    if (!role.title) throw new Error(`${rolesPath}: ${key}.title is required`);
  }
}

module.exports = {
  validateSources,
};
