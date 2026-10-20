import { fieldsExactlyMatch, type FieldMapping, type OperatorField } from "../../app/lib/workflow";

export type InputRequirement = { nodeId: string; field: OperatorField; binding?: FieldMapping; suppliedUpstream: boolean };

// Only genuinely unsupplied inputs become workflow inputs. Broken explicit
// bindings remain errors; deriving the boundary must never silently repair them.
export function deriveWorkflowInputs(requirements: InputRequirement[], existing: OperatorField[], startId: string) {
  const fields: OperatorField[] = [];
  const bindings: { nodeId: string; key: string }[] = [];
  const conflicts: string[] = [];
  for (const { nodeId, field, binding, suppliedUpstream } of requirements) {
    if (field.system) continue;
    if (binding && binding.sourceType !== "parameter") {
      if (binding.sourceType === "upstream" && binding.sourceNodeId === startId) {
        const previous = existing.find((item) => item.key === binding.sourceField);
        if (previous && !fields.some((item) => item.key === previous.key)) fields.push(previous);
      }
      continue;
    }
    if (!field.required && binding?.sourceType !== "parameter") continue;
    if (suppliedUpstream && binding?.sourceType !== "parameter") continue;
    const sameName = fields.find((item) => item.key === field.key);
    if (sameName && !fieldsExactlyMatch(sameName, field)) { conflicts.push(field.key); continue; }
    if (!sameName) fields.push(field);
    bindings.push({ nodeId, key: field.key });
  }
  return { fields, bindings: bindings.filter((item) => !conflicts.includes(item.key)), conflicts: [...new Set(conflicts)] };
}

export function singleTrialInput(value: string): string {
  const rows = value.trim().split(/\r?\n/).filter((row) => row.trim());
  if (rows.length !== 1) throw new Error("试跑仅支持一条数据，请只保留一条输入");
  return rows[0].trim();
}
