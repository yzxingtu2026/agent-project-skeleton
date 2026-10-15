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

// 从 gh CLI 当前登录身份解析 GitHub 用户名/邮箱；不可用时返回空值，不抛错。
// 邮箱优先取账号公开邮箱，否则回退到 GitHub 官方 no-reply 格式（id+login）。
function ghIdentity() {
  const empty = { githubUsername: "", githubEmail: "", name: "", available: false };
  // 允许在离线/CI/测试环境显式禁用 gh 身份探测，保证行为可确定。
  if (process.env.AGENT_RULES_NO_GH === "1") return empty;
  try {
    const raw = execFileSync("gh", ["api", "user"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const user = JSON.parse(raw);
    const login = user.login || "";
    if (!login) return empty;
    const email = user.email || (user.id ? `${user.id}+${login}@users.noreply.github.com` : "");
    return {
      githubUsername: login,
      githubEmail: email,
      name: user.name || "",
      available: true,
    };
  } catch (error) {
    return empty;
  }
}

module.exports = {
  configureGitAuthor,
  ghIdentity,
  gitConfig,
  gitRemoteUrl,
};
