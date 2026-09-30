# Phase 2 throwaway UI prototype

Question: Can the existing editor gain clearer guidance and better information hierarchy with limited frontend rework?

Current answer for review (2026-09-29): keep the generated configuration form vocabulary; distinguish source selection from fixed input names; derive connection mapping markers from saved bindings; keep operator outputs read-only and let the terminal node choose delivery fields; edit structured AI output in one schema configuration; keep the node library, configuration panel, and run details as floating surfaces.

Route: /Openhandle/?prototype=phase2. In-memory only. Execution, diagnosis and publish are mock states. `control.transform` remains an edge relation and is excluded from add-node candidates.

Accepted user decisions and design proposals are separated in ../../../二期交互决策记录-20260928.md and ../../../二期编排界面变更方案与UI交付-20260928.md (workspace parent documents).

After UI/product approval, absorb the accepted interaction rules into the production specification and remove this throwaway route. It is not a replacement for company source or translation protocol implementation.

2026-09-30 review: source options are grouped by upstream node and highlight that node on the canvas; AI output uses flat CSV-compatible columns with previewed schema import; validation shows operator outputs and editable final delivery selections. QPS is no longer a user-facing advanced control. The version-management control is a button placeholder. Dock separators remain, with reduced-motion-aware hover magnification. No production protocol or executor was added.
