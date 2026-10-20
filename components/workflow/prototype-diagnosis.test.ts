import { describe, expect, it } from "vitest";
import { addDiagnosisFollowUp, addReportedProblems, createDiagnosisResult, diagnosisSummary, type DiagnosisContext } from "./prototype-diagnosis";

const trial: DiagnosisContext = {
  id: "trial-1", source: "trial", revision: 3, recordedAt: "14:20:00", phase: "failed", inputCount: 2,
  nodes: [{ id: "ai", label: "理解视频" }, { id: "parse", label: "解析结果" }],
  issues: [{ nodeId: "ai", field: "title", message: "缺少 title" }, { nodeId: "parse", field: "keywords", message: "keywords 类型不匹配" }],
};

describe("prototype diagnosis record", () => {
  it("keeps every issue and its snapshot location in the card data and copied summary", () => {
    const result = createDiagnosisResult(trial);
    expect(result.findings.map((finding) => finding.location.nodeId)).toEqual(["ai", "parse"]);
    expect(result.context).toMatchObject({ record_id: "trial-1", revision: 3 });
    expect(result.status).toBe("needs_evidence");
    const summary = diagnosisSummary(trial, result);
    expect(summary).toContain("理解视频 / title");
    expect(summary).toContain("解析结果 / keywords");
    expect(result.findings.every((finding) => finding.evidence_refs.every((ref) => result.evidence.some((item) => item.id === ref)))).toBe(true);
  });

  it("accepts several reported deviations after a successful trial without an error code", () => {
    const context = { ...trial, phase: "passed" as const, issues: [] };
    const result = addReportedProblems(context, createDiagnosisResult(context), "期望中文标题，实际为英文\n下载文件缺少第二条记录", "", "result.csv");
    expect(result.findings).toHaveLength(2);
    expect(result.findings.every((finding) => finding.assessment === "suspected")).toBe(true);
    expect(result.findings[0].location).toMatchObject({ nodeLabel: "本次运行结果", field: "result.csv" });
    expect(result.context.record_id).toBe("trial-1");
    expect(result.status).toBe("needs_evidence");
  });

  it("retains previous issues on follow-up and rejects another trial's evidence", () => {
    const initial = createDiagnosisResult(trial);
    const next = addReportedProblems(trial, initial, "这个字段为何缺失？", "ai", "title");
    expect(next.findings.slice(0, 2)).toEqual(initial.findings);
    expect(next.findings[2].location).toMatchObject({ nodeId: "ai", field: "title" });
    expect(() => addReportedProblems({ ...trial, id: "trial-2" }, next, "继续", "", "")).toThrow("诊断上下文不一致");
  });

  it("keeps follow-up questions separate from newly reported problems", () => {
    const initial = createDiagnosisResult(trial);
    const next = addDiagnosisFollowUp(trial, initial, "应当补充哪条样本？");
    expect(next.findings).toEqual(initial.findings);
    expect(next.followups).toHaveLength(1);
    expect(diagnosisSummary(trial, next)).toContain("追问：应当补充哪条样本？");
    expect(() => addDiagnosisFollowUp({ ...trial, id: "trial-2" }, next, "继续")).toThrow("诊断上下文不一致");
  });

  it("supports validation without an execution and does not invent output evidence", () => {
    const context: DiagnosisContext = { ...trial, id: "validation-3", source: "validation", phase: "blocked", inputCount: 0 };
    const initial = createDiagnosisResult(context);
    expect(initial.evidence.map((item) => item.type)).toEqual(["configuration", "validation", "validation"]);
    const next = addReportedProblems(context, initial, "这些校验问题如何调整？", "", "");
    expect(next.findings.at(-1)?.suggestions[0].action).toContain("尚未执行");
    expect(next.context.source).toBe("validation");
  });
  it("opens a draft conversation without a trial or fabricated errors", () => {
    const context: DiagnosisContext = { ...trial, id: "draft-3", source: "draft", phase: "passed", inputCount: 0, issues: [] };
    const result = createDiagnosisResult(context);
    expect(result.context.source).toBe("draft");
    expect(result.findings).toEqual([]);
    expect(result.summary).toContain("尚无本次执行数据");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].excerpt).toContain("草稿检查");
    expect(diagnosisSummary(context, result)).toContain("草稿检查记录");
  });
});
