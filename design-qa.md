# Phase 2 editor prototype — design QA

Date: 2026-09-28. final result: passed

Acceptance scope: an interaction target for UI review, preserving current drawer design elements and adopting user-confirmed n8n node morphology. This is not a pixel clone of the company page or n8n, production protocol validation, or complete production QA.

## Visual truth and evidence

- Source: `../设计参考/一期开发中-右侧配置与Flow节点库-20260928.jpg` (3024×1654), `../设计参考/一期开发中-算子节点库与画布-20260928.jpg`, `../设计参考/n8n-画布-用户参考-20260928.png` (3024×1602).
- Browser-rendered implementation: `http://127.0.0.1:5174/Openhandle/?prototype=phase2` in local Chrome. Native CUA screenshots at 3024×1772; content starts at y=174. Crop to 3024×1598, downsample 2× to 1512×799 CSS-equivalent content. Source company screenshot downsampled 2× to 1512×827. The 28px height difference is recorded, not interpreted as design drift.
- Implementation screenshots: `../设计参考/二期原型/01-默认画布.png`, `02-配置抽屉.png`, `03-Flow展开.png`, `04-试跑失败.png`, `05-联合检索.png`, `06-试跑产出.png`, `07-三栏对照.png`, `08-用户工作流版本.png`.
- Full-view combined comparison: `../设计参考/二期原型/对照-整体-最终.png`. Source and implementation are included in one input; different workflow content, hidden library and compact nodes are intentional.
- Focused combined comparison: `../设计参考/二期原型/对照-抽屉-最终.png`. Source uses vod.upload and implementation vod.upload.tos, with different input/output tags; the shared control design, runtime values, scroll region and fixed save are the comparison target. Runtime controls were focused with Tab to expose them. No claim of matching exact workflow data or scroll offset.

## Findings and iteration history

1. [P2, resolved] Flow expand placed steps behind the inspector; expansion button stayed on “展开”. Initial browser screenshot: `Flow展开-修正前.png`. Synchronize expansion draft state, fit the selected group within available canvas and keep unrelated rows from shifting. Place a globally added Flow below existing nodes to avoid overlap. Post-fix `03-Flow展开.png` shows all four steps and “收起”, with read-only internals. Intentional focus on the group can put unrelated graph nodes outside the viewport; Fit View returns to the whole graph.
2. [P2, resolved] Initial form and library fonts were too small for the source readability. Initial combined focused evidence: `对照-抽屉.png`. Increase key form labels/values from 12px to 14px, library titles to 14px and descriptions to 12px, node captions to 13px and summaries to 11px. Re-capture `02-配置抽屉.png` and compare in `对照-抽屉-最终.png`. Preserved gray blocks, white inputs, switch, blue output tag and fixed blue save remain readable. Increased content length scrolls within the drawer.
3. [P2, resolved] A failed mock run formerly marked the downstream node successful. Execute only through the failure node; mark downstream unexecuted and show no output. `04-试跑失败.png` shows an AI red error badge, upstream success and the end without a success badge.
4. [P2, resolved] Line insertion initially opened the edge information modal again. Prevent insertion-button propagation and explicitly maintain selected-edge state. Replayed the action in Chrome: library caption “插入到当前连线”, then transform insertion changed transfer→AI to transfer→new→AI. Undo restored the original connection. These are behavioral observations, separate from the visual comparisons.

Earlier outline-action buttons were accidentally styled blue and all plus controls displayed together; this was corrected before the stored final visual comparisons. Primary blue actions and outline secondary actions are distinguishable; local plus controls are shown when relevant. No actionable P0/P1/P2 differences remain for the reviewed target.

## Required fidelity surfaces

- Typography: system/PingFang fallback, clear title versus caption hierarchy; form labels and values now 14px, source approximately 16px. Exact company font/token not provided. Small ID text stays secondary; long node names truncate, with full text in drawer/details. Final UI should use company font tokens.
- Spacing/layout: source’s gray config block, input padding/radius and fixed drawer save are preserved in form language. Inspector 370px versus source roughly 420px is an intentional review starting point. Added input binding and advanced group shift fold position; these product changes are flagged in handoff. Canvas gains space from hidden library and compact nodes. Major controls are visible at the tested viewport.
- Color/tokens: white workspace, pale gray forms, blue action/output field, gray input field, green success and red failure. Changes use local prototype values; exact production tokens remain company-owned. Source turquoise sharing frame is capture chrome, excluded.
- Image quality/assets: no generated illustrations or raster substitutions. Standard icon library used for interaction examples. Company logo/global navigation were not recreated as assets and are explicitly outside editor redesign scope; production must retain those existing assets. There is no claim of platform brand fidelity.
- Copy/content: names, purpose, ID, node-versus-Flow, matched step and precise version are explicit. Mock execution/publishing/diagnosis labels are visible. Source and target example operators differ as noted. No funnel appears. Prototype-only caution/copy is to be removed from production flows when real services are implemented.

## Primary interactions tested in Chrome

- Global/library and selected-node plus; search vod.upload yields two nodes and a four-step Flow; matched step and full composition visible.
- Engineering/user source switch; whole-Flow addition, expand/collapse and undo/redo.
- User V1/V2 selection: choose V1, description changes to 720p, added node and drawer keep V1.
- AI Gemini→DeepSeek changes fields and warns; uncommitted switch triggers save/discard/continue, discard restores previous model.
- Delete connection: invalid source warning appears; undo restores edge and clears that warning. Selected-edge plus inserts with explicit rewiring; undo restores graph.
- Single and two sample mock runs; pass output, failure position, detail and three-column view; return to canvas. Save after a completed run flags old snapshot.
- Tab exposes runtime input controls while fixed save remains available.

No real executor/model/publish action was performed. Console instrumentation was not separately inspected. Multi-resolution, production directory scale, full keyboard workflow, condition rule lifecycle, port-drag/reconnect and real Flow/merge execution remain test gaps, not claimed as tested.

## Implementation checklist

- [x] Browser-rendered primary states captured.
- [x] Full and focused source+implementation comparisons normalized and reviewed together.
- [x] P2 findings corrected and post-fix evidence reviewed.
- [x] Existing form design elements preserved; proposed new behaviors separated in UI brief.
- [x] No backend/protocol compatibility or real execution claim.

Follow-up polish (P3): tune exact company typography/tokens and tooltip treatment with UI; finalize context menu placement for edge actions; review measured width thresholds on production desktop sizes.

final result: passed

## 2026-09-29 acceptance update

- `npm run lint`, `npm run test` (26 tests), `npm run build:pages`, and `git diff --check` pass. The build still reports one large JS chunk.
- Browser checks confirmed fixed input names with selectable upstream sources, saved bindings reflected on their exact incoming edge, editable AI output structure, and a mock schema-mismatch run failing visibly.
- Adding AI field `D`, removing the selected `keywords` field, and changing `summary` to Boolean updated the output preview and final-delivery choices; the previous delivery reference remained visibly invalid and blocked validation.
- Explicit 1920×1080 and 1440×900 viewport checks found no horizontal page overflow. The inspector stays clear of the canvas toolbar, and the trial dock expands to its left. Opening the node library collapses the dock to a status bar; reopening trial also closes the library and preserves `demo_vid_001`.
- `control.transform` remains defined in the underlying edge-relation catalog and is excluded from addable node candidates.
- The 2026-09-29 delivery ZIP still contains 2026-09-28 baseline PNGs. They are labelled as baseline material; they are not visual evidence for the new UI.
- Browser checks also confirmed delivery fields can be deselected/restored; deleting an AI field already selected for delivery leaves a visible invalid reference and blocks validation. Flow expand/collapse works and the collapsed card measures 256px. Repairing an invalid ordinary-node input binding remains unverified. No production execution, model protocol, or compatibility claim is made.


## 2026-09-30 已发现视觉问题收尾

按用户要求仅完成两项已发现问题，不继续发现新问题：

- 可读性：统一浅灰辅助文字为 #606d7d；原有 8–10px 文字提升到至少 11px，保留正文既有字号。主操作蓝改为 #096fc6，表单增加可见键盘焦点。
- 三栏对照：修正浮动配置抽屉样式覆盖三栏布局的根因。展开时配置位于中栏，输入在左、输出在右；返回画布入口无遮挡，可实际点击返回。
- Computer use 验证：1440×900 的中栏边界为 x≈469–1035，1920×1080 为 x≈610–1374；两种尺寸返回按钮均通过顶部命中检查。1440 下实际点击返回成功，并核对校验区与默认配置文字。
- 完整 lint、页面构建通过。本次只涉及样式，未增加业务逻辑测试。原有 JS chunk 体积提示仍存在。
- 技能机械扫描提示既有字体、字号、颜色与旧 DESIGN.md 记录不一致；本轮保留已确认的二期原型视觉方向，未扩大到设计文档迁移。
- 运行版已同步最新构建。包内 PNG 仍为旧基线图，本轮浏览器截图仅用于现场核对。
