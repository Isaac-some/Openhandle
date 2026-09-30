# Openhandle Agent Workflow Builder

Agent 工作流编排交互原型，用真实算子数据验证节点连接、字段映射、条件分流、表达式筛选、二路聚合、运行前校验和数据守恒。

- 代码仓库：[Isaac-some/Openhandle](https://github.com/Isaac-some/Openhandle)
- 原版界面：[GitHub Pages](https://isaac-some.github.io/Openhandle/)
- 二期原型预览：[GitHub Pages](https://isaac-some.github.io/Openhandle/?prototype=phase2)
- 部署记录：[GitHub Actions](https://github.com/Isaac-some/Openhandle/actions/workflows/deploy-pages.yml)
- 完整交接：[HANDOFF.md](./HANDOFF.md)
- 产品决策：[PRODUCT.md](./PRODUCT.md)
- 视觉规范：[DESIGN.md](./DESIGN.md)

## 已实现的主要能力

- 54 个启用的业务算子，按 Enrich、Filter、Transform、IO 展示。
- 4 个可复用 Flow，支持锁定组拖动和解锁后逐节点编排。
- 1–10 条顺序条件规则，强制保留 `Else` 兜底。
- `保留 / 筛除` 双出口表达式筛选。
- 严格字段结构校验的二路聚合。
- 多线路结束节点、字段映射、阻断问题定位，以及数据守恒规则与模拟展示。
- 本地自动保存草稿、撤销/重做、复制、删除、框选、快捷添加和模拟素材校验。

## 新电脑快速开始

先安装 Git 和 Node.js 22 LTS。然后执行：

```bash
cd "<你准备存放项目的目录>"
git clone https://github.com/Isaac-some/Openhandle.git
cd Openhandle
npm ci
npm test
npm run lint
npm run build:pages
npm run dev:pages
```

开发服务启动后，按终端打印的地址访问，默认为 `http://localhost:5173/Openhandle/`。

## 命令说明

| 命令 | 用途 | 当前状态 |
| --- | --- | --- |
| `npm run dev:pages` | 启动与 GitHub Pages 同入口的本地开发服务 | 推荐 |
| `npm run build:pages` | 构建 `pages-dist/` 静态站点 | 正式发布路径 |
| `npm run preview:pages` | 预览已生成的 Pages 构建 | 需先运行 `build:pages` |
| `npm test` | 运行 Vitest 工作流规则测试 | 当前测试集 |
| `npm run lint` | 运行 ESLint | 发布必须通过 |
| `npm run build` | 构建 Vinext/Sites 路径 | 非正式发布路径 |
| `npm run dev` | 启动 Vinext/Sites 本地路径 | 已知首页 500，不要用于日常开发 |

## 重要的数据边界

代码、锁定依赖、算子数据和演示素材都已进入 Git。但编排草稿和“上线”后的私有快照只保存在当前浏览器 `localStorage`，不会随 GitHub、账号或新电脑自动同步。项目当前也没有后端、真实 Batch 执行或用户账号系统。

请在换电脑前通读 [HANDOFF.md](./HANDOFF.md)，其中详细列出了会同步和不会同步的内容、架构、已知问题、发布流程与接手检查清单。
