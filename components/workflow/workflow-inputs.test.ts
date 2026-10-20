import { describe, expect, it } from "vitest";
import { deriveWorkflowInputs, singleTrialInput } from "./workflow-inputs";
import type { OperatorField } from "@/app/lib/workflow";

const vid: OperatorField = { key: "vid", type: "String", semanticType: "media_locator.vod_id", cardinality: "one", required: true };
describe("workflow input boundary", () => {
  it("derives only unsupplied inputs and deduplicates identical requirements", () => {
    const result = deriveWorkflowInputs([
      { nodeId: "transfer", field: vid, suppliedUpstream: false },
      { nodeId: "other", field: vid, suppliedUpstream: false },
      { nodeId: "ai", field: { ...vid, key: "tos_path" }, suppliedUpstream: true },
    ], [], "start");
    expect(result.fields.map((field) => field.key)).toEqual(["vid"]);
    expect(result.bindings).toHaveLength(2);
  });
  it("does not turn fixed, optional or system inputs into start fields", () => {
    expect(deriveWorkflowInputs([
      { nodeId: "a", field: vid, binding: { sourceType: "fixed", value: "123" }, suppliedUpstream: false },
      { nodeId: "b", field: { ...vid, required: false }, suppliedUpstream: false },
      { nodeId: "c", field: { ...vid, system: true }, suppliedUpstream: false },
    ], [], "start").fields).toEqual([]);
  });
  it("preserves valid start bindings without repairing broken explicit sources", () => {
    const result = deriveWorkflowInputs([
      { nodeId: "a", field: vid, binding: { sourceType: "upstream", sourceNodeId: "start", sourceField: "vid" }, suppliedUpstream: false },
      { nodeId: "b", field: vid, binding: { sourceType: "upstream", sourceNodeId: "removed", sourceField: "vid" }, suppliedUpstream: false },
    ], [vid], "start");
    expect(result.fields).toEqual([vid]); expect(result.bindings).toEqual([]);
  });
  it("refuses to conflate same-named fields with different contracts", () => {
    const result = deriveWorkflowInputs([
      { nodeId: "a", field: vid, suppliedUpstream: false },
      { nodeId: "b", field: { ...vid, type: "Int" }, suppliedUpstream: false },
    ], [], "start");
    expect(result.conflicts).toEqual(["vid"]); expect(result.bindings).toEqual([]);
  });
  it("retains a start field while an optional consumer still explicitly uses it", () => {
    const result = deriveWorkflowInputs([{ nodeId: "optional", field: { ...vid, required: false }, binding: { sourceType: "upstream", sourceNodeId: "start", sourceField: "vid" }, suppliedUpstream: false }], [vid], "start");
    expect(result.fields).toEqual([vid]);
  });
  it("accepts exactly one trial input and rejects a pasted batch", () => {
    expect(singleTrialInput("  demo  ")).toBe("demo");
    expect(() => singleTrialInput("one\ntwo")).toThrow("一条");
    expect(() => singleTrialInput(" ")).toThrow("一条");
  });
  it("moves a workflow input requirement onto an intermediate output without retaining an unused start field", () => {
    const path = { ...vid, key: "tos_path" };
    const required = deriveWorkflowInputs([{ nodeId: "ai", field: path, binding: { sourceType: "parameter", value: "tos_path" }, suppliedUpstream: false }], [vid], "start");
    expect(required.fields.map((field) => field.key)).toEqual(["tos_path"]);
    const mapped = deriveWorkflowInputs([
      { nodeId: "transfer", field: vid, binding: { sourceType: "upstream", sourceNodeId: "start", sourceField: "vid" }, suppliedUpstream: false },
      { nodeId: "ai", field: path, binding: { sourceType: "upstream", sourceNodeId: "transfer", sourceField: "tos_path" }, suppliedUpstream: true },
    ], [vid, path], "start");
    expect(mapped.fields.map((field) => field.key)).toEqual(["vid"]);
  });
});
