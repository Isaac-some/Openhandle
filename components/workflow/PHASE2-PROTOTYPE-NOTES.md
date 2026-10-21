# Phase 2 throwaway UI prototype

Question: Can the existing editor gain clearer guidance and better information hierarchy with limited frontend rework?

Current answer for review (2026-09-29): keep the generated configuration form vocabulary; distinguish source selection from fixed input names; derive connection mapping markers from saved bindings; keep operator outputs read-only and let the terminal node choose delivery fields; edit structured AI output in one schema configuration; keep the node library, configuration panel, and run details as floating surfaces.

Route: /Openhandle/?prototype=phase2. In-memory only. Execution, diagnosis and publish are mock states. `control.transform` remains an edge relation and is excluded from add-node candidates.

## 2026-10-21 算子用途检索与 Flow 复用

- 统一“添加节点”入口，面板内“找算子／找 Flow”分别检索、保存查询状态；不增加顶部“复用 Flow”按钮。约 600 指基础算子，不能作为 Flow 数量；原型继续使用小规模本地样例。
- 直接文字、别名及有限拼写匹配立即可用；用途补充约 1.35 秒，2 秒自动等待预算；深入核对由用户触发，约 6.2 秒，分阶段展示实际演示任务与耗时，可取消。
- 结果按直接／用途／深入分区；稳定身份去重，已有候选仅补充分析引用。慢任务不得前插、重排、抢焦点或触发滚动。深入操作固定在面板底部，不被后到结果挤走。改词、换对象、过滤、关闭、重试和目录状态变化使旧任务失效。
- 页面不保留原型状态、发布阶段、权限模拟、试跑失败或报错示例等演示控件。异常和撤权场景在自动化测试中验证；模拟边界只写在交付文档。
- 算子结果可拖入落点；Flow 结果按所选版本拖入为节点组，保留当前画布。拖后检索面板保持打开，不自动移动视角或旧节点；空白画布拖放不沿用局部添加上下文改线。支持撤销重做。
- Flow 可按整体目标与希望修改的内容找方案。版本集中选择，新建按所选版本复制实际节点、配置及显式连线，建立新身份并保留来源 Flow ID／版本；推荐改动不自动应用。
- 原草稿、未保存节点配置、撤销栈、试跑及诊断上下文分别保留在页面内；修改版不继承旧运行记录，可往返编辑。详情保留按指定版本整组添加。
- 血缘理由只来自样例有向连线与端口，展示来源 Flow／版本；无查询且有上游上下文才显示连接推荐，不把共现称为采用事实或运行成功。
- 用途与深入阶段均为规则演示，无向量／模型／生产 API、持久化或真实效果测量。向量生产接入需在核验后的资料上做同查询对照，本次不采购或建立向量服务。
- 补齐精确模型身份添加、Qwen 动态输出的真实列路径，避免生成 undefined 前缀；Diagnoser 浮钮避让配置抽屉底部，保证保存配置可点击。
- 原样例 Flow 的字段契约仍须校验，复制不等于可直接运行。本地样例 `vod.transcoding.query.v2` 无声明输出，来源 Flow 的 `vid` 映射会如实提示失效，不静默改成同名来源。
- 本次仅本地审核；未经用户审核通过，不 commit、不 push、不发布 GitHub Pages。

Accepted user decisions and design proposals are separated in ../../../二期交互决策记录-20260928.md and ../../../二期编排界面变更方案与UI交付-20260928.md (workspace parent documents).

After UI/product approval, absorb the accepted interaction rules into the production specification and remove this throwaway route. It is not a replacement for company source or translation protocol implementation.

2026-09-30 review: source options are grouped by upstream node and highlight that node on the canvas; AI output uses flat CSV-compatible columns with previewed schema import; validation shows operator outputs and editable final delivery selections. QPS is no longer a user-facing advanced control. The version-management control is a button placeholder. Dock separators remain, with reduced-motion-aware hover magnification. No production protocol or executor was added.

2026-10-20 recorded review (supersedes the earlier read-only scope): errors expose “AI 诊断并修复”; diagnosis opens in a draggable, resizable non-modal window, with minimize/restore, record switching and node references. Existing node configuration and input bindings can be changed only after the user reviews and applies a before/after proposal. Application validates the complete proposal, refuses stale/removed/read-only targets, rechecks configuration, and supports a guarded undo. Nodes, flow edges and operator code are never changed by a proposal; reruns remain user-initiated. A loaded error example breaks two existing field bindings so the entire repair can be reviewed locally. An invalid explicit binding is no longer silently replaced by a same-named upstream field during validation. Production diagnosis and the separate AI workflow-design assistant are deferred. All suggestions remain labelled rule-based demonstrations without a real model or benefit telemetry. Optional per-record 10% feedback and snapshot-bound conversations remain.

2026-10-20 node-reference review: selecting a canvas node and pressing Ctrl/Cmd+C copies a structured node-instance reference; text fields retain normal copy behavior. Diagnoser pastes resolve identity within the captured workflow/snapshot, render the original canvas icon and node name, and retain clickable references in sent messages. Missing icons fall back to a blue name link; an explicit prototype-only checkbox under reference details previews this state. Details expose ID/workflow/snapshot. Invalid, removed and cross-snapshot references remain visible and prevent sending until resolved or removed. The toolbar duplicate action is named “创建节点副本” to distinguish creating a new instance from copying a reference.


## 2026-10-20 字段引用先行补充

- 视频转存输入 `vid` 属于字段；输入／输出字段和 CSV 表头可一键完整复制。
- 剪贴板纯文本示例：`{transfer}`、`{transfer.inputs.vid}`、`{transfer.outputs.tos_path}`、`{csv.path}`。临时语法不表示生产协议。
- 支持引用的文本配置为原子文本块，与文字混排，Backspace／Delete 整块删除；保存重开保留表达式。
- CSV 两行本地预览按当前行替换，不把第一行固化，不调用执行器。失效或不可达配置引用阻断校验。
- 顶部切换先行字段阶段／后续 Diagnoser 预览；默认前者。后续对话支持字段引用名称链接、定位及整块移除。
- 当前演示仅在页面内保留，不持久化，无真实模型／生产调用。GitHub 等用户本地验收通过后再推送。


## 2026-10-20 16:33 录屏及后续字段映射纠正

- Diagnoser 顶部常驻；节点异常、校验与试跑结果的诊断按钮不再被先行阶段开关隐藏。主动打开会切换诊断预览；草稿求助保留独立 draft 来源，不冒充试跑证据。
- 来源菜单监听抽屉滚动与窗口尺寸，跟随字段定位；字段滚出可视区域时关闭；菜单内滚动不触发重定位。
- 开始节点不再预置 vid/tos_path/path/rowkey。连通性通过后，校验倒推尚无上游供给的必填输入；唯一完全一致的来源会记录实际绑定，失效的已有绑定保留报错。
- 字段映射只选择可达上游输出或工作流输入，移除当前原型的固定值/动态引用填写入口。固定参数属于既有工作流输入与配置契约，不在映射里建立第二套赋值规则。
- 将 AI tos_path 映射到开始时，校验要求 vid、tos_path；再映射到视频转存输出后校验，只保留 vid。仍被其他消费者或配置引用的起点字段保留。
- 移除每节点重复 CSV 表头表，直接复制节点输入/输出字段；提示词继续支持原子引用及单条本地取值预览。试跑只接受一条数据。
- R2 V1.5 补齐发布保存、加载、执行阶段的引用解析要求；R5 V1.3 同步常驻入口与已获准的配置方案应用。生产解析与真实模型仍未实现。
- 本轮没有 commit 或 push；本地验收后再按用户要求发布。


## 2026-10-20 17:46 录屏与指定对话卡片

- 使用用户提供的 assistant-card 结构，实装 `components/ui/ai-assistant-card.tsx`；仅保留 Diagnoser 标识、会话、统一输入和发送，移除建议操作、模型切换、附件、录音与快捷操作。
- 打开对话仅显示欢迎空态，发问后才展示可读回复和按需展开的修复方案；去掉“继续追问/补充新问题”按钮与位置表单。
- 节点/字段引用直接进入同一个富文本输入框，支持与文字混排、整块删除与纯文本复制；发送保留行内链接并清空待发送引用，不在输入框之外堆放标签。
- 全局入口由顶部移至右下角常驻浮动按钮并增强阴影；校验与试跑结果处的上下文诊断按钮保留。
- “查看依据”集中承载当前记录、报错、日志/源码可用状态和配置；无真实日志与源码时明确未接入，不伪造读取证据。历史记录选择与摘要复制放入此处。
- 新节点优先放在来源节点正右侧同一水平线上，确有碰撞时再向下找空位；字段映射入口扩至32px高度。
- 运行时数据统一在底部试跑详情中切换节点查看；右侧及三列配置只显示定义，移除右侧“本次试跑”页签。底部诊断入口继续保留。
- 生产模型、执行器、持久化和发布仍未接入；未 commit/push。R2/R5 正式 PRD 本轮未重写，以上为本地原型验收变更记录。
