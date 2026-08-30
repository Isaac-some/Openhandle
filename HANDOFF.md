# Agent Workflow Builder 完整交接文档

> 交接准备日期：2026-08-31
> 权威分支：`main`
> 本次交接锚点：`handoff-2026-08-31`
> 权威仓库：https://github.com/Isaac-some/Openhandle
> 正式环境：https://isaac-some.github.io/Openhandle/

## 1. 先说结论

这是一个桌面端 Agent 工作流编排原型，用于验证真实算子元数据、字段映射、条件分流、表达式筛选、二路聚合、结束结局和数据守恒。它不是已接入生产 Batch 平台的正式产品。

代码、依赖锁文件、54 个业务算子快照、4 个 Flow、控制节点、测试、演示素材、产品规则和视觉规范都由 GitHub `main` 分支管理。新电脑 clone 该仓库后，可恢复可开发、可测试、可发布的项目状态。

影响当前可运行源码状态、但不能靠 GitHub 自动迁移的主要数据是浏览器数据：页面中手动编辑的草稿和点击“上线”后生成的私有快照只存在当前浏览器 `localStorage`。如果旧电脑上有需要保留的自定义草稿，必须在离开旧电脑前按第 7.3 节单独备份。另有不影响当前运行的原始素材和算子上游目录未入库，见第 7.2 节。

`handoff-2026-08-31` 是本次交接状态的固定 tag；后续继续开发时仍以 GitHub `main` 最新成功部署的提交为准。

## 2. 权威资料地图

不要从截图、旧临时交接或 commit 标题重新猜需求：

| 资料 | 用途 | 必读时机 |
| --- | --- | --- |
| [`PRODUCT.md`](./PRODUCT.md) | 用户、产品目标、领域规则和不变量 | 产品/交互改动前 |
| [`DESIGN.md`](./DESIGN.md) | 色彩、排版、间距、组件和视觉禁区 | 任何界面改动前 |
| [`README.md`](./README.md) | 项目概览和最短启动路径 | 第一次 clone 后 |
| [`HANDOFF.md`](./HANDOFF.md) | 恢复、架构、发布、迁移边界和已知问题 | 换电脑/换接手人时 |
| [`app/data/operators.json`](./app/data/operators.json) | 54 个已启用业务算子快照 | 算子数据改动时 |
| [`app/lib/workflow.ts`](./app/lib/workflow.ts) | 领域类型、控制节点、Flow、字段传播和校验规则 | 编排逻辑改动时 |
| [`components/workflow/workflow-builder.tsx`](./components/workflow/workflow-builder.tsx) | 编排器状态、操作、本地持久化、模拟校验和主布局 | 主界面/状态改动时 |
| [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) | 正式 GitHub Pages 发布流程 | CI/发布改动时 |

视觉参考 Figma：https://www.figma.com/design/vGPOgUc3wJqEcbLPgE05BB/%E6%89%B9%E6%AC%A1%E8%AF%A6%E6%83%85UI%E4%BC%98%E5%8C%96?node-id=242-2

## 3. 新电脑从零恢复

### 3.1 前置条件

- Git。
- Node.js 22 LTS。仓库提供 `.nvmrc`，`package.json` 要求 `>=22.13.0`。
- npm。使用 `package-lock.json` + `npm ci`，不要换 yarn/pnpm 重算依赖。
- clone、本地开发、测试和 Pages 构建不需要 `.env`、API key、数据库或云资源。
- 如需推送，新电脑必须重新配置有写权限的 GitHub 认证；不要拷贝旧电脑的 token/SSH key。

### 3.2 clone 与安装

```bash
cd "<你准备存放项目的目录>"
git clone https://github.com/Isaac-some/Openhandle.git
cd Openhandle
git switch main
git pull --ff-only origin main
git fetch origin --tags
npm ci
```

如果使用 `nvm`：

```bash
cd Openhandle
nvm install
nvm use
npm ci
```

### 3.3 验证恢复

```bash
cd Openhandle
git status --short --branch
npm test
npm run lint
npm run build:pages
```

期望：Git 显示 `main...origin/main` 且工作树干净；26 个 Vitest 领域逻辑测试全部通过；Lint 无错误；`pages-dist/` 构建成功。

确认本地与 GitHub 一致：

```bash
cd Openhandle
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git rev-parse 'handoff-2026-08-31^{commit}'
git diff --exit-code origin/main
git status --porcelain
```

前两个 SHA 应一致；交接完成时 tag SHA 也应与它们一致。日后 `main` 有新开发提交时，tag 会继续固定在本次交接点，这是正常现象。最后两个命令应无输出。

### 3.4 可靠的本地开发入口

```bash
cd Openhandle
npm run dev:pages
```

默认访问 `http://localhost:5173/Openhandle/`，以终端实际打印为准。此入口与正式 GitHub Pages 共用 `pages/main.tsx`、`WorkflowBuilder` 和 `app/globals.css`。

`npm run dev` 是 Vinext + OpenAI Sites + Cloudflare 兼容层入口，当前首页请求返回 HTTP 500，根因表现为 Vinext SSR 路径中 `ReferenceError: document is not defined`。不要用它做日常开发。

## 4. 架构与数据流

```text
app/data/operators.json
        │
        ▼
app/lib/workflow.ts
算子/控制节点/Flow、初始图、推荐、字段传播、静态校验
        │
        ▼
components/workflow/workflow-builder.tsx
React Flow 状态、编辑动作、草稿持久化、模拟校验/上线
        ├─ operator-library.tsx：节点库
        ├─ workflow-node.tsx / workflow-edge.tsx：画布节点和连线
        ├─ inspector-panel.tsx：节点配置
        ├─ connection-inspector.tsx：字段映射
        └─ validation-run-panel.tsx：模拟素材校验
```

双入口、单一主界面：

- `app/page.tsx` 是 Next/Vinext App Router 入口。
- `pages/main.tsx` 是 GitHub Pages 静态入口。
- 两者都渲染 `WorkflowBuilder`，并共用 `app/globals.css`。
- `pages/next-image.tsx` 在 Pages 构建中替代 `next/image`。
- 正式发布只使用 `vite.pages.config.ts` 和 `pages-dist/`。

关键模块：

| 路径 | 职责 |
| --- | --- |
| `app/lib/workflow.ts` | 领域类型、控制节点、Flow、初始图、推荐、字段传播、循环检查、聚合兼容和数据守恒 |
| `workflow-builder.tsx` | 画布状态、操作历史、草稿、模拟校验/上线和主布局 |
| `workflow-node.tsx` | 业务/控制/起止节点卡片、端口、具名出口和运行状态 |
| `workflow-edge.tsx` | 连线、映射状态和中点反馈 |
| `inspector-panel.tsx` | 节点配置、输入、字段来源和条件规则 |
| `connection-inspector.tsx` | 出参/入参选择和错配信息 |
| `operator-library.tsx` | 算子、Flow 和控制节点库 |
| `validation-run-panel.tsx` | 模拟素材校验、人工回传和守恒结果 |

## 5. 已完成的进度

- 54 个业务算子，分 Enrich、Filter、Transform、IO；快照 `verifiedAt` 为 2026-06-30，52 条 high confidence、2 条 medium confidence。
- 4 个 Flow：筛除水印视频、等待人工回传、视频元数据校验、生成视频预览。
- 节点库显示 7 个控制节点；`control.transform` 是连线上的字段映射关系。
- 1–10 条具名条件 + `Else`；表达式筛选 `保留 / 筛除`；二路分片 `A / B`。
- 二路聚合只接受字段数量、名称、类型和结构完全一致的线路。
- 搜索/领域筛选、点击/拖拽添加、快捷推荐、字段映射、节点/连线检查器、复制、删除、撤销/重做、框选、缩放和小地图。
- 静态校验覆盖唯一启动节点、结束节点、必填输入/配置、字段兼容、数值安全范围、具名出口、显式聚合、循环和每个出口可达结束节点。
- 数据守恒规则函数 `getDataConservationStatus()` 已有单元测试；当前运行面板的守恒结果仍是模拟展示，不是实际 Batch 统计。
- 默认“多媒体质量校验”示例有 7 个工作节点和 6 条连线。
- 当前视觉基线是克制的冷白/蓝灰体系；算子卡片宽 220px，空闲态不显示“入 / 出 / 1:N”等重复底栏，只在运行时显示必要状态。

## 6. 必须理解的原型边界

- “校验”用计时器模拟 6 条素材处理、人工回传和结果，不调真实算子。
- UI 展示的“6 / 6 数据守恒”是演示结果；`getDataConservationStatus()` 有单元测试，但当前运行面板没有用真实输入/结局调它。
- “上线”只生成 `private-wf-*` ID，并把最多 20 条快照写入浏览器。
- 没有后端 API、数据库、真实算子调度、Batch 运行页、用户登录、权限或多人同步。
- “已自动保存”表示已写当前浏览器，不是已上传云端。
- WCAG 2.2 AA 是 `PRODUCT.md` 中的产品目标，当前没有 axe/E2E/完整无障碍审计证据，不能对外宣称已全面达标。

## 7. 数据、素材与迁移

### 7.1 会随 GitHub 同步

- 已跟踪源码、测试和文档。
- `package.json` / `package-lock.json`。
- `app/data/operators.json` 的当前算子快照。
- `public/test-assets/` 的演示图片和转码媒体（约 12 MB）。
- GitHub Actions 与 GitHub Pages 配置。

### 7.2 不会随 GitHub 同步

- `localStorage` 草稿：`agent-workflow-builder:draft:v8`（兼容读 v7）。
- `localStorage` 私有快照：`agent-workflow-builder:private-workflows:v1`。
- `.env*`、GitHub 凭据、SSH key。
- `node_modules/`、`.next/`、`.wrangler/`、`dist/`、`pages-dist/`、`next-env.d.ts` 等可再生成文件。
- `original-test-assets/` 的 3 个原始 MP4（约 35 MB）。运行所需转码版已在 `public/test-assets/`。
- `scripts/sync-operators.mjs` 需要的外部 catalog JSONL 和 enabled CSV。脚本已入库，但本次生成快照的上游文件、位置和负责人尚未入库。

### 7.3 离开旧电脑前备份浏览器草稿

仅当旧浏览器中有需保留的自定义编排时才需要。在实际使用过的每个 origin（GitHub Pages、localhost 等）分别打开页面，在浏览器 DevTools Console 执行以下脚本。脚本会下载一份 JSON，不依赖 Chrome 专有的 `copy()`：

```js
(() => {
  const backup = {
    origin: location.origin,
    draftV8: localStorage.getItem("agent-workflow-builder:draft:v8"),
    draftV7: localStorage.getItem("agent-workflow-builder:draft:v7"),
    privateWorkflows: localStorage.getItem("agent-workflow-builder:private-workflows:v1")
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `openhandle-browser-backup-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
})();
```

把下载的文件作为私密 JSON 单独保管。它可能包含项目配置或业务数据，不要提交到这个公开 GitHub 仓库。只在 DevTools 中执行本交接文档里的脚本，不要粘贴来源不明的 Console 代码。

新电脑恢复时，必须打开与备份 `origin` 完全一致的站点。`localhost` 与 `127.0.0.1` 不同，端口不同也不是同一 origin。GitHub Pages 备份直接打开正式页；本地备份应按 JSON 中的 host 和端口启动，例如备份写着 `http://localhost:5173` 时执行：

```bash
cd Openhandle
npm run dev:pages -- --host localhost --port 5173 --strictPort
```

`--strictPort` 会在端口被占用时直接报错，避免 Vite 静默换到 5174 导致“恢复后看不到数据”。若 JSON 中是 `127.0.0.1` 或其他端口，命令也要逐字对应。

在匹配的页面打开 DevTools Console，把备份 JSON 文件的完整内容替换到下面第一行注释位置，然后执行：

```js
const backup = /* 把备份 JSON 文件的完整内容粘贴到这里 */;
if (location.origin !== backup.origin) {
  throw new Error(`origin 不一致：当前 ${location.origin}，备份 ${backup.origin}`);
}
const entries = [
  ["agent-workflow-builder:draft:v8", backup.draftV8],
  ["agent-workflow-builder:draft:v7", backup.draftV7],
  ["agent-workflow-builder:private-workflows:v1", backup.privateWorkflows]
];
for (const [key, value] of entries) {
  if (typeof value === "string" && value.length > 0) {
    localStorage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
  }
}
location.reload();
```

该脚本只替换或删除上面三个 Openhandle key，不会清空其他站点数据。恢复前不要手动清空目标浏览器数据。若不确定，让接手 agent 先离线检查备份格式；不要在公开对话中粘贴完整草稿。

### 7.4 素材与公开仓库风险

- 仓库未提供 `LICENSE`，代码公开不等于授予他人复用权。
- 3 张图片文件名显示来自 Pexels；3 个演示视频的完整来源/授权未在仓库说明。
- 在对外长期发布前，应由项目负责人确认代码许可证、媒体授权、真人/隐私与 54 个算子 ID/字段在公开仓库的可披露性。

## 8. 产品与视觉不变量

- 画布优先，不建无关仪表盘。
- CSS 强制界面最小宽度 1180px；产品建议工作宽度不低于 1280px，暂无移动端产品目标。
- 节点身份色只分业务算子、平台控制、启动/结束三组；四类业务行为靠图标和文字区分。
- 保留冷白、蓝灰、深墨蓝和稀少晴蓝。警告琥珀色是有意保留的语义色。
- 保留现有排版、圆角、布局、拖拽和连线动效，除非新需求明确扩大范围。
- 不做暗色玻璃、霓虹紫渐变、装饰性发光、彩色粗侧边、渐变文字或过量大圆角。
- 结束不是聚合；普通节点不允许隐式汇合；筛除数据不允许静默消失。
- 字段映射基于明确字段身份和类型，不用名称相似度猜测。

## 9. 已知问题与非阻断警告

### 9.1 Vinext 本地首页 500

- 复现：`npm run dev`，请求 `/`。
- 结果：HTTP 500，`ReferenceError: document is not defined`。
- 影响：Vinext/Sites 本地入口；GitHub Pages 静态入口不受影响。
- 当前绕行：`npm run dev:pages`。
- 后续：如确实需要 Vinext/Sites，使用根因诊断，不要给 SSR 塞浏览器对象打补丁。

### 9.2 构建警告

- 干净环境的 `npm ci` 当前会提示锁定的 `eslint@9.39.4` 已停止支持；安装和 Lint 仍能成功。后续应单独规划依赖升级，不要在交接提交里无验证地重算锁文件。
- `npm run build:pages` 会报主 JS chunk 大于 500 kB，当前不阻断发布。
- `npm run build` 当前能成功，但会有 LightningCSS `@theme/@tailwind` 警告和 Vinext 路由分类警告；它不是正式发布门禁。

### 9.3 自动化覆盖边界

当前 26 个测试只覆盖 `app/lib/workflow.test.ts` 中的领域逻辑。尚无组件测试、浏览器 E2E、键盘/无障碍自动化、视觉回归或部署后自动 smoke test。

## 10. 标准验证门禁

```bash
cd Openhandle
npm test
npm run lint
npm run build:pages
git status --short --branch
```

界面改动还要在浏览器检查相关状态，不能用 26 个领域测试证明整个 UI 正常。

## 11. Git 与 GitHub Pages

### 11.1 真实仓库与旧电脑陷阱

- 公开仓库：`Isaac-some/Openhandle`，默认分支 `main`。
- 旧电脑的真实 Git 根目录是 `agent-workflow-builder/.git`；外层工作区还有无关 Git 仓库。旧电脑操作前先 `cd agent-workflow-builder` 并用 `git rev-parse --show-toplevel` 确认。
- 本机 `sites` remote 和 `legacy-sites-main-20260828` 是已废弃的 Sites 历史，与 GitHub `main` 无共同祖先，不包含当前主线独有进度，不随普通 clone 迁移，不要 merge 进 `main`。
- 不要 force-push；不要对不明改动执行 `git reset --hard`。

### 11.2 正式发布流程

push `main` 后，`.github/workflows/deploy-pages.yml` 自动：

1. checkout。
2. Node 22 + npm cache。
3. `npm ci`。
4. `npm test`。
5. `npm run lint`。
6. `npm run build:pages`。
7. 上传 `pages-dist/` artifact。
8. 发布 GitHub Pages。

Actions：https://github.com/Isaac-some/Openhandle/actions
正式页：https://isaac-some.github.io/Openhandle/

`vite.pages.config.ts` 的 base 固定为 `/Openhandle/`。如果仓库改名或在 fork 中启用 Pages，必须同步改 base，否则静态资源 404。

### 11.3 正常提交流程

```bash
cd Openhandle
git status --short --branch
git diff --check
git fetch origin
git rev-list --count HEAD..origin/main
npm test
npm run lint
npm run build:pages
git add <本次明确改动的文件>
git diff --cached --check
git diff --cached
git commit -m "<清晰的提交说明>"
git push origin main
```

`git rev-list` 必须输出 `0`；若不是 `0`，说明远端已有本地没有的提交，应先停止并核对，不要带着未提交改动直接 pull。推送后等 GitHub Actions 成功，再检查正式页。

## 12. 不要提交

- `node_modules/`。
- `.env*`、`*.pem`、token、SSH key 和任何凭据。
- `.next/`、`.vinext/`、`.wrangler/`、`dist/`、`pages-dist/`、`out/`。
- `original-test-assets/`。
- 浏览器草稿备份、不明来源的业务 catalog、真实 AK/SK、生产数据或用户信息。

推送前检查：

```bash
cd Openhandle
git status --short
git diff --cached --name-only
git diff --cached
```

## 13. 重要历史节点

- `d395cb1` — 删除算子卡片空闲态底部的输入/输出/基数重复信息。
- `606515b` — 将暖色基础刷新为冷白、蓝灰和晴蓝体系。
- `bf4de50` — 当前编排器主要功能原型基线。

最新交接提交以 GitHub `main` 当前 HEAD 为准，不能把上面历史 SHA 误当作最新代码。

## 14. 接手后优先级

1. 先做干净 clone 验证，不要立即改代码。
2. P0：如需跨设备草稿，实现带 schema 版本的 JSON 导出/导入或真实持久化。
3. P0：补齐算子 catalog/enabled 上游来源、负责人与媒体/代码授权记录。
4. P1：如确实需要 Vinext/Sites，单独诊断 `document is not defined`。
5. P1：补组件/E2E/无障碍/视觉回归和 typecheck 门禁。
6. P2：如原型继续产品化，设计真实后端、身份、持久化和执行 API，不在 `localStorage` 假上线上继续打补丁。

## 15. Suggested skills

接手的 Codex/agent 建议按任务使用：

- `handoff`：重大迭代后刷新交接文档。
- `zoom-out`：改陌生模块前理解它与领域规则、画布状态和部署入口的关系。
- `impeccable`：界面、信息层级、密度、色彩和最终打磨，保持 `DESIGN.md` 的 product register。
- `browser:control-in-app-browser`：验证本地 Pages 交互与正式 GitHub Pages。
- `diagnose`：调查 Vinext SSR `document is not defined` 或其他难故障，找根因、不打补丁。
- `review`：推送重大改动前同时对照仓库标准和用户需求审查。

## 16. 接手完成判定

以下全部成立才算恢复完成：

- 已从 `Isaac-some/Openhandle` clone，位于 `main`。
- `HEAD` 与 `origin/main` 一致，工作树干净。
- `npm ci` 成功。
- 26 个领域测试通过。
- Lint 通过。
- `npm run build:pages` 通过。
- `npm run dev:pages` 能打开编排器。
- 已明确处理“旧电脑没有需迁移的草稿”，或“旧电脑已备份、新电脑已按 7.3 恢复并刷新核验”其中一种情况。
- 知道 GitHub Pages 是当前唯一正式环境，Vinext/Sites 不是发布主路径。
- 有写权限的接手人已在新电脑配好 GitHub 认证。

满足后，无需拷贝旧电脑的 `node_modules`、构建产物或本机缓存，就可直接继续开发。
