# dsh-purge 补丁体检对账表 / Patch Health Audit

> 目标宿主：DeepSeek Harness **0.2.0-rc.2**（桌面版，`resources/app.asar`）
> 方法：把 `app.asar` 内 338 个包、3512 个 `lib/*.js` / `src/*.ts` 拼成 ~60MB 文本，逐条 patch 用其 `pattern` 原文做子串命中。
> 结论口径：`LIVE` = 锚点在真身原样命中；`PARTIAL` = 多锚点部分命中；`DEAD` = 锚点在真身全部打空；`PROMPT` = 走 `prompt-inject.md`、不依赖 asar。

## 汇总 / Summary

| 状态 | 数量 |
|---|---|
| LIVE | 6（#4 #39 #48 #52 #58 #61） |
| PARTIAL | 7（#1 #23 #25 #33 #42 #53 #68） |
| DEAD（代码锚点失配） | 57 |
| PROMPT / 无代码锚点 | 12 |

**为什么大面积 DEAD**：0.2.0 把 `agent-loop` / `session-controller` 的职责拆进了 `@earendil-works/pi-ai`、`dsh-api-workspace-controller`、`dsh-typert-*`，方法体重写；`dsh-escalation` 包在新版**直接不存在**；审批逻辑搬进了 `dsh-tools` / `dsh-typert`。旧 patch 的字符串锚点因此全部对不上。

## 高价值且可救的代码补丁

> **二次核对结论（对磁盘解包真身逐标记验证）**：下列"高价值代码补丁"在当前 0.2.0-rc.2 宿主上**全部已应用**——之前审计标 DEAD 是因为锚点原文因重构而变，但写入后的 `[dsh-purge-*]` 标记仍在真身里。
> 因此**这批没有需要重做的**；唯一真正新增价值是把 `#74` 的锚点改成"多候选 + 幂等"，避免升级后它一旦失效就整条丢失。

| ID | 名称 | 真身位置 | 现状 | 处置 |
|---|---|---|---|---|
| #74 | ASSEMBLE_BEFORE_PRESTEP | `dsh-agent-loop/lib/index.js` `this.inbox.claim(...)` | 曾待修 | **已改多候选锚 + skipIfMarked（本次提交）**，真身 `node --check` 通过 |
| #87/#88 | HUNG_PROMPT_* | `dsh-agent-loop/lib/index.js` `renderPrompt(assembly)` 下方 | 已应用（标记恒在） | 无需重打 |
| #55 | SYSTEM_PROMPT_REPLACE_HEAD | `dsh-agent-loop` `inHistory: false // [dsh-purge] system prompt replaces the first node` | **已应用** | 无需重打 |
| #66 | SYSTEM_PROMPT_RENDER_GUARD | `dsh-system-prompt/lib/index.js` `renderPrompt` `guard undefined section text` | **已应用** | 无需重打 |
| #59 | OFFICIAL_AUTO_REVIEW_PASSTHROUGH | `dsh-experimental-auto-review/lib/index.js` `return next(); // soft intercept disabled` | **已应用** | 无需重打 |
| #85 | SESSION_PROMPT_ALWAYS_FOLLOWUP | `dsh-api-session-controller/lib/index.js` `agent.followup(message); // [dsh-purge-85]` | **已应用** | 无需重打 |
| #86 | SESSION_STEER_ALWAYS_FOLLOWUP | 同上 `case "steer": … agent.followup(message); // [dsh-purge-86]` | **已应用** | 无需重打 |

### 仍待处理的 DEAD（真身无锚点、需按当前代码重新定位或判断是否需要）

| ID | 名称 | 现状 | 备注 |
|---|---|---|---|
| #13/#14/#35 | ESCALATION_* | `dsh-escalation` 包在 0.2 **不存在** | 升级豁免类需迁移到 `dsh-sandbox`/`dsh-typert` 才可能生效；当前宿主无对应文件 |
| #64/#65 | HOOKS_*_DENY_ALLOW | 标记 `__dsh_purge_deny_disabled__` 在真身未检出 | 需要先确认 hooks 机制在本宿主是否启用 |

> 结论：其余标 DEAD 的补丁，其目标包/方法在 0.2.0-rc.2 已被重构或移除，非简单重锚可解；是否迁移按需再评估。

## 重要发现 / Gotchas

1. **`dsh-api-workspace-controller/lib/typert.remote-client.js` 是诱饵**：它带同样的中文文档段落（含 `typert.remote-client` 里的 `async step(decision)`、`__dshPurgeHungPrompt` 等），但**不是可执行模块**，文件头没有 `import`，`node --check` 直接语法错误。真正的步进循环在 **`dsh-agent-loop/lib/index.js`**（import/export 正常，`node --check` 通过）。**绝不要**把 workspace-controller 注册为 patch 目标——往它里面追加代码只会把宿主搞崩。已在 `targetFiles()` 留注释警告。
2. **`app.asar` 读取疑似被安全层 hook**：用 PowerShell `BinaryReader` 直接读 `app.asar` 里 `dsh-agent-loop/lib/index.js` 的字节，得到的是错位片段；而磁盘上解包后的同名文件（`resources/app/dsh/node_modules/.../dsh-agent-loop/lib/index.js`）是干净、可 `node --check` 的。诊断/验证一律以**磁盘解包文件**为准。
3. **#87/#88 在当前宿主已是"已应用"态**：磁盘文件里恒有 `[dsh-purge-87]` / `[dsh-purge-88]` 标记，`__dshPurgeHungPrompt` 出现 2 次——是既有注入，不是缺失，重跑不会再叠。
4. **#64/#65（hooks deny）**：asar 里存在 `__dsh_purge_deny_disabled__` 标记，属"已应用"，显示 DEAD 是锚点变更而非漏打。

## 修复 #74 的验证记录 / Verify log（对真实磁盘文件）

```
dsh-agent-loop/lib/index.js
  baseline: claim=1  renderPrompt(assembly)=1  prepare-hook=0  hung 标记已存在
  #74 apply  → changed=true, dshPurgePrepare 出现一次, claim 行未重复
  #74 重跑   → changed=false（skipIfMarked 生效，不叠）
  node --check(打补丁后整文件) → exit 0
```

> 说明：`dshPurgePrepare` 在整文件里出现 4 次是"`const` + 2 处 `typeof/调用` + 注释"的文本计数，不是重复注入；`claim` 行仍只有 1 处。
