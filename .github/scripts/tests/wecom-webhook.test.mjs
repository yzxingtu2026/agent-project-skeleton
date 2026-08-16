import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  buildWeComPayload,
  limitWeComMarkdown,
  postWeComMessage,
} from "../wecom-webhook.mjs";

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../../..");

test("存在提醒成员时使用 markdown 并插入 userid", () => {
  const payload = buildWeComPayload({
    markdown: "## PR 审核请求\n\n[查看详情](https://example.com/pr/1)",
    mentionUserIds: ["zhangsan", "zhangsan", "lisi"],
  });

  assert.equal(payload.msgtype, "markdown");
  assert.match(payload.markdown.content, /^<@zhangsan> <@lisi>/);
  assert.match(payload.markdown.content, /查看详情/);
});

test("没有提醒成员时使用 markdown_v2", () => {
  const payload = buildWeComPayload({
    markdown: "## GitHub 通知\n\n- Issue #5",
  });

  assert.deepEqual(payload, {
    msgtype: "markdown_v2",
    markdown_v2: { content: "## GitHub 通知\n\n- Issue #5" },
  });
});

test("超长内容限制为 4096 字节并保留详情链接", () => {
  const link = "[查看详情](https://example.com/issues/5)";
  const content = limitWeComMarkdown(`${"企业微信通知".repeat(800)}\n\n${link}`);

  assert.ok(Buffer.byteLength(content, "utf8") <= 4096);
  assert.match(content, /内容已截断/);
  assert.match(content, /https:\/\/example.com\/issues\/5/);
});

test("企业微信返回非零 errcode 时发送失败", async () => {
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ errcode: 93000, errmsg: "invalid webhook" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    await assert.rejects(
      postWeComMessage({
        webhookUrl: `http://127.0.0.1:${address.port}/send?key=secret`,
        payload: { msgtype: "markdown_v2", markdown_v2: { content: "test" } },
      }),
      /企业微信机器人返回失败/,
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("企业微信返回 errcode 0 时发送成功", async () => {
  let receivedPayload;
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    receivedPayload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ errcode: 0, errmsg: "ok" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    const payload = buildWeComPayload({ markdown: "## 发布完成" });
    await postWeComMessage({
      webhookUrl: `http://127.0.0.1:${address.port}/send?key=secret`,
      payload,
    });
    assert.deepEqual(receivedPayload, payload);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("GitHub 协作通知 dry-run 输出企业微信 payload", async () => {
  const fixturePath = path.join(
    rootDir,
    ".github/scripts/tests/fixtures/issues-assigned.json",
  );
  const { stdout } = await execFileAsync(
    process.execPath,
    [".github/scripts/github-notify.mjs", "--dry-run"],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "issues",
        GITHUB_EVENT_PATH: fixturePath,
        NOTIFICATION_FORCE_ENABLED: "1",
      },
    },
  );
  const payload = JSON.parse(stdout);

  assert.equal(payload.msgtype, "markdown_v2");
  assert.match(payload.markdown_v2.content, /GitHub Issue 分配/);
  assert.match(payload.markdown_v2.content, /未配置企业微信 userid/);
  assert.match(payload.markdown_v2.content, /issues\/5/);
});
