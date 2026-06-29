const { execFileSync } = require("child_process");

function configureGitAuthor(repo, profile) {
  try {
    execFileSync("git", ["config", "user.name", profile.name], { cwd: repo.root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", profile.githubEmail], { cwd: repo.root, stdio: "ignore" });
    execFileSync("git", ["config", "github.user", profile.githubUsername], { cwd: repo.root, stdio: "ignore" });
    console.log("configured local git user.name, user.email and github.user");
  } catch (error) {
    console.warn("warning: failed to configure local git identity; please run git config manually");
  }
}

function gitConfig(repo, key) {
  try {
    return execFileSync("git", ["config", "--get", key], { cwd: repo.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (error) {
    return "";
  }
}

module.exports = {
  configureGitAuthor,
  gitConfig,
};
