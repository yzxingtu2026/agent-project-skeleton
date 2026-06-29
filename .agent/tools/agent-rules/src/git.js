const { execFileSync } = require("child_process");

function configureGitAuthor(repo, profile) {
  try {
    execFileSync("git", ["config", "user.name", profile.name], { cwd: repo.root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", profile.githubEmail], { cwd: repo.root, stdio: "ignore" });
    execFileSync("git", ["config", "github.user", profile.githubUsername], { cwd: repo.root, stdio: "ignore" });
    console.log("已配置当前仓库的 git user.name、user.email 和 github.user");
  } catch (error) {
    console.warn("警告：未能配置当前仓库的 Git 身份，请手动运行 git config。");
  }
}

function gitConfig(repo, key) {
  try {
    return execFileSync("git", ["config", "--get", key], { cwd: repo.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (error) {
    return "";
  }
}

function gitRemoteUrl(repo, remote = "origin") {
  try {
    return execFileSync("git", ["remote", "get-url", remote], { cwd: repo.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (error) {
    return "";
  }
}

module.exports = {
  configureGitAuthor,
  gitConfig,
  gitRemoteUrl,
};
