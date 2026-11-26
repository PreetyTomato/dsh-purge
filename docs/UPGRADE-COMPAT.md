# 升级兼容与多候选锚 / Upgrade Compatibility & Multi-Candidate Anchors

DPH DSH 版本迭代时，`core.js` 里的字符串 patch 常因方法改名/搬家而整批失配。本文说明本 fork 引入的「多候选锚」机制与在新宿主上重新对锚的做法。

## 1. 多候选锚（`patterns: [...]`）

一条 replacement 现在可以写成：

```js
{
  patterns: [
    "<旧宿主原文 A>",
    "<新宿主原文 B>",
  ],
  replace: "<统一替换文本>",
}
```

语义：
- 遍历 `patterns`，**第一个在目标文本中命中的候选**用于替换；
- 命中后其余候选在同一次 apply 内跳过（`firedSlots`），避免同文件被写两次造成抖动/重复；
- 兼容旧的单 `pattern` 写法（原样工作）；
- 配合 `skipIfMarked: true`：命中后写入了 marker，之后重跑直接跳过，绝不二次追加。

实现位置：`lib/core.js` 的 `patchReplacements()`（展开为多 entry）与 `applyReplacementsToText()`（`firedSlots` 互斥）。

### 单测（已在真实文件上跑过）

```js
const p = { id: 900, replacements: [ { patterns: ["AAA","BBB"], replace: "X" } ] };
applyReplacementsToText("AAA", p) // => "X"
applyReplacementsToText("BBB", p) // => "X"
applyReplacementsToText("CCC", p) // => "CCC"（无命中=不改）
```

## 2. 在新宿主上重新对锚的流程

1. **取真身**：以磁盘解包文件为准——
   `D:\deepseekHARNESS\resources\app\dsh\node_modules\@deepseek-ai\<pkg>\lib\...js`。
   不要以 `app.asar` 二进制直读的片段为准（见 PATCH-AUDIT 的 Gotcha 2）。
2. **确认是真模块**：文件头应有 `import`/`export`，`node --check <file>` 返回 0。
   带中文文档但无 `import` 的 `typert.*` 是诱饵，别改。
3. **定位锚点**：用真实方法名 grep（如 `this.inbox.claim`、`renderPrompt(assembly)`、`request.mode === "steer"`）。
4. **写 replacement**：
   - 锚点尽量取"短且稳定"的一行，替换里**包含锚点自身**（幂等）；
   - 多版本不确定就用 `patterns` 列多候选；
   - 加 `skipIfMarked: true`，markers 用唯一 `[dsh-purge-xx]` 串。
5. **验证**：`node --check` 目标文件 → 对打补丁后的整文件再 `node --check` → 载入 `applyReplacementsToText` 断言 `changed` 与标记计数。
6. **别注册非本 patch 的诱饵文件**：`targetFiles()` 里每个 key 都会被写入/备份/回滚；只登记真正会被执行的模块。

## 3. 当前已确认的真身位置（0.2.0-rc.2）

| 关注点 | 文件 |
|---|---|
| agent 步进循环（`inbox.claim` / `renderPrompt` / `system.assemble`） | `dsh-agent-loop/lib/index.js` |
| 会话 steering / followup | `dsh-api-session-controller/lib/index.js` |
| 工具执行前钩子（auto-review） | `dsh-experimental-auto-review/lib/index.js` |
| 沙箱策略提示词 | `dsh-sandbox-policy/lib/index.js`（#61 LIVE） |
| 审批 fail-open（锚点需再定位） | `dsh-tools/lib/index.js` / `dsh-typert-*` |

## 4. 与上游 fork 的关系

本开发树 `origin = https://github.com/PreetyTomato/dsh-purge`（fork 自 `mmparko/dsh-purge`）。
- **本机 cwd 兼容修正必须保留**：`{{cwd}}` 在新宿主会触发 `unknown prompt variable`，本地已改回静态
  `Working directory is shown in the session context.`（`lib/core.js` + `cordis.patch.yml`）。
- 拉取上游 master 后如覆盖回 `{{cwd}}`，需重放该修正（见对应 commit）。
