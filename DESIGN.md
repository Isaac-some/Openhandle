---
name: Agent Workflow Builder
description: 为内部 Agent 处理路径提供清晰、可追溯的亮色编排工作台
colors:
  canvas-white: "oklch(1 0 0)"
  panel-gray: "oklch(0.975 0.004 80)"
  ink-blue: "oklch(0.235 0.025 255)"
  muted-ink: "oklch(0.50 0.018 255)"
  honey-action: "oklch(0.62 0.15 80)"
  branch-blue: "oklch(0.57 0.18 255)"
  success-green: "oklch(0.57 0.15 155)"
  warning-amber: "oklch(0.68 0.15 80)"
  danger-red: "oklch(0.56 0.20 25)"
typography:
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.honey-action}"
    textColor: "{colors.canvas-white}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  workflow-node:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.ink-blue}"
    rounded: "{rounded.md}"
    width: "248px"
---

# Design System: Agent Workflow Builder

## Overview

**Creative North Star: “明亮的运行控制台”**

这是一个在白天办公环境中长时间使用的生产力工具。纯白画布、分层浅灰面板和深墨蓝文字保持高可读性；蜂蜜金只标记主操作和当前选中态。业务节点通过节制的类型色区分，但内容层级仍由排版、空间和标签建立。

**Key Characteristics:** 高密度、强对齐、低装饰、状态可解释、画布优先。

## Colors

亮色中性表面承载主要信息，蜂蜜金提供一个罕见但稳定的操作锚点。节点身份色只保留业务算子、平台控制、启动/结果三组低饱和浅色；Enrich、Filter、Transform、IO 依靠图标和文字区分。

### Primary
- **Honey Action** (`oklch(0.62 0.15 80)`): 仅用于生成工作流、选中节点和当前导航，单屏占比不超过 10%。

### Secondary
- **Branch Blue** (`oklch(0.57 0.18 255)`): 连线、可连接端口和信息状态。

### Neutral
- **Canvas White** (`oklch(1 0 0)`): 画布和节点主表面。
- **Panel Gray** (`oklch(0.975 0.004 80)`): 节点库、工具栏和配置面板。
- **Ink Blue** (`oklch(0.235 0.025 255)`): 主文字，与白色表面对比度高于 7:1。

**The Rare Accent Rule.** 蜂蜜金不用于大面积背景或装饰；它的罕见性本身就是层级。

## Typography

**Display Font:** Inter (ui-sans-serif fallback)  
**Body Font:** Inter (ui-sans-serif fallback)  
**Label/Mono Font:** ui-monospace，仅用于字段键、类型和精确版本。

**Character:** 使用单一人文无衬线字体构建紧凑而稳定的界面，不用展示字体营造「科技感」。

### Hierarchy
- **Title** (600, 16px, 1.3): 面板和节点标题。
- **Body** (400, 14px, 1.5): 说明、配置和风险提示。
- **Label** (500, 12px, 1.4): 字段、端口和工具栏；不默认全大写或拉宽字距。

## Elevation

默认依靠背景层和 1px 中性边界建立结构。阴影只在节点悬停、拖拽和弹出层中作为状态反馈，不与宽模糊边框叠加。

**The Flat-by-default Rule.** 静止界面保持平坦，高度是交互状态，不是装饰。

## Components

### Buttons
- **Shape:** 10px 圆角，高度 36px。
- **Primary:** 蜂蜜金填充和白色文字，仅用于生成工作流。
- **Hover / Focus:** 150–200ms 状态过渡；2px 可见焦点环。

### Chips
- **Style:** 浅色语义背景、对应深色文字和完整 1px 边框。
- **State:** 图标和文字与色彩共同表达状态。

### Cards / Containers
- **Corner Style:** 节点 10px，主面板 0–14px。
- **Background:** 白色画布、浅灰工具面。
- **Shadow Strategy:** 节点仅在悬停和拖拽中上浮。
- **Border:** 1px 中性边界，错误、选中和连接预览使用语义色。

### Inputs / Fields
- **Style:** 白色背景、8px 圆角、明确标签；默认值和来源同时显示。
- **Focus:** 2px 焦点环和边界加深。
- **Error / Disabled:** 错误使用图标、文字和颜色；系统身份字段显式锁定。

### Navigation
- 只保留工作栏和面包屑所需的层级，不建设无关的仪表盘导航。

### Workflow Node
- 248px 宽，显示类型、名称、精确算子 ID、输入/输出数量和配置健康状态。连接口具名且可键盘访问。
- 只有没有下游的非结束节点显示圆形快捷添加入口，菜单优先展示字段语义与生产者声明最匹配的算子。

### Flow Group
- 添加 Flow 后显示中性虚线组框，默认锁定内部节点并支持整体拖动。
- 组框头部提供明确的“解锁”动作；解锁后移除组框，节点保持原位置并恢复独立拖动。

### Route Control Node
- 条件分流显示 1–10 条可命名、可排序的规则出口，末尾始终显示不可删除的 `Else`；二路平均分片显示 `A / B` 两个具名出口。
- 表达式筛选使用紧凑的 `保留 / 筛除` 双出口；两个出口都显示连接状态，筛除线路不能隐式丢弃。
- 每个出口只能连接一条路径，节点卡片直接显示连接状态，连线中点保留出口名称。

### End Node
- 结束节点配置「输出结果 / 筛除」结局与结局名称，无下游出口。
- 允许多条线路接入同一个结束节点；这只表示共用最终结局，不触发字段聚合。
- 测试校验展示输入数量与结束数量，并明确报告缺失、重复和未知数据 ID。

### Inline Edge Step
- 无内联步骤的普通连线不显示常驻文字。
- 字段映射或异常状态在线路中点显示图标；悬浮与键盘聚焦后展开名称和字段详情。

## Do's and Don'ts

### Do:
- **Do** 让节点、连线、具体字段同时承载错误定位。
- **Do** 业务算子的徽标和图标统一使用 Enrich、Filter、Transform、IO 四类，但四类共用业务算子身份色；控制节点和启动/结果分别使用另外两组身份色。
- **Do** Flow 在节点库中以节点组展示，添加后以组框锁定真实节点，并允许显式解锁。
- **Do** 在画布工具条中明确切换左键拖动画布与左键框选节点。
- **Do** 为拖拽、滚动、弹出和动画提供减少动效退化。

### Don't:
- **Don't** 使用暗色玻璃拟态、霓虹紫渐变或装饰性发光的 AI 后台风格。
- **Don't** 原样复制 n8n 的品牌外观或工程术语。
- **Don't** 用过量卡片、大于 16px 的容器圆角和模态框包装日常动作。
- **Don't** 把编辑、校验和真实执行混为同一个动作。
- **Don't** 使用大于 1px 的彩色侧边条、渐变文字或重复斜纹背景。
