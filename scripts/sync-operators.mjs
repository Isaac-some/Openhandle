import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1]]);
    return pairs;
  }, []),
);

if (!args.catalog || !args.enabled || !args.out) {
  throw new Error("Usage: node scripts/sync-operators.mjs --catalog <catalog.jsonl> --enabled <enabled.csv> --out <operators.json>");
}

const enabled = new Set(
  (await readFile(args.enabled, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "operator_id"),
);

const operators = (await readFile(args.catalog, "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((operator) => enabled.has(operator.operator_id))
  .map((operator) => ({
    id: operator.operator_id,
    name: operator.display_name,
    description: operator.use_when?.replace(/[,，]\s*$/, "") || operator.source_facts?.description || "",
    avoidWhen: operator.avoid_when || "",
    domains: operator.domains || [],
    capabilities: operator.capabilities || [],
    behavior: operator.behavior || "transform",
    cardinality: operator.cardinality || "1:1",
    executionPattern: operator.execution_pattern || "sync",
    inputs: (operator.data_inputs || []).map((field) => ({
      key: field.field_key,
      type: field.data_type || "Unknown",
      required: Boolean(field.required),
      semanticType: field.semantic_type || "field.generic",
      cardinality: field.cardinality || "one",
      producers: field.producers || [],
      system: /identity|resource_id|batch_id/i.test(field.field_key),
    })),
    config: (operator.config_schema || []).map((field) => ({
      key: field.field_key,
      type: field.data_type || "String",
      required: Boolean(field.required),
      defaultValue: field.default === "unknown" ? "" : field.default,
      constraints: field.constraints === "unknown" ? "" : field.constraints,
    })),
    outputs: (operator.outputs || []).map((field) => ({
      key: field.field_key,
      type: field.data_type || "Unknown",
      semanticType: field.semantic_type || "field.generic",
      cardinality: field.cardinality || "one",
    })),
    risks: operator.risks || [],
    verifiedAt: operator.evidence?.verified_at || "",
    confidence: operator.evidence?.confidence || "unknown",
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

await mkdir(dirname(args.out), { recursive: true });
await writeFile(args.out, `${JSON.stringify(operators, null, 2)}\n`);
console.log(`Wrote ${operators.length} enabled operators to ${args.out}`);
