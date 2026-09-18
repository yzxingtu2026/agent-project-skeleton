const { CliError } = require("./output");
const { readTeamMembers, readTeamRoles } = require("./team");

function fail(message) {
  throw new CliError(message, {
    code: "check_failed",
    exitCode: 3,
    fix: "请修正 .agent/team/ 下的源文件后重试。",
  });
}

function validateSources(repo) {
  validateTeamMembers(repo);
  validateTeamRoles(repo);
}

function validateTeamMembers(repo) {
  const membersPath = ".agent/team/members.yml";
  const members = readTeamMembers(repo);
  const entries = Object.entries(members);
  if (!entries.length) fail(`${membersPath} 至少需要定义一名团队成员`);

  for (const [key, member] of entries) {
    const github = member.github || {};
    if (!member.name) fail(`${membersPath}: ${key}.name 不能为空`);
    if (!member.role) fail(`${membersPath}: ${key}.role 不能为空`);
    if (!github.username) fail(`${membersPath}: ${key}.github.username 不能为空`);
    if (!github.email) fail(`${membersPath}: ${key}.github.email 不能为空`);
  }
}

function validateTeamRoles(repo) {
  const rolesPath = ".agent/team/roles.yml";
  const roles = readTeamRoles(repo).roles || {};
  if (!Object.keys(roles).length) fail(`${rolesPath} 至少需要定义一个团队角色`);
  for (const [key, role] of Object.entries(roles)) {
    if (!role.title) fail(`${rolesPath}: ${key}.title 不能为空`);
  }
}

module.exports = {
  validateSources,
};
