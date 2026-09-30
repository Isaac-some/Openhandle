export type OutputShapeField = { key: string; type: string; required: boolean; description: string; choices?: string[] };
export const columnTypes = { String: "文本", Int: "整数", Float: "数字", Boolean: "是 / 否" };
export function buildOutputSchema(fields: OutputShapeField[]) {
  return {
    type: "object",
    properties: Object.fromEntries(fields.map((field) => [field.key, {
      type: ({ String: "string", Int: "integer", Float: "number", Boolean: "boolean" } as Record<string, string>)[field.type] ?? "string",
      ...(field.description ? { description: field.description } : {}),
      ...(field.type === "String" && field.choices?.length ? { enum: field.choices } : {}),
    }])),
    required: fields.filter((field) => field.required).map((field) => field.key),
    additionalProperties: false,
  };
}
export function outputShapeErrors(fields: OutputShapeField[]) {
  const errors: string[] = [];
  if (!fields.length) errors.push("至少配置一个 AI 输出列");
  const keys = fields.map((field) => field.key.trim());
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) errors.push("输出列名不能为空且不能重复");
  if (fields.some((field) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field.key))) errors.push("列名使用英文字母、数字和下划线，不能嵌套或含空格");
  if (fields.some((field) => !(field.type in columnTypes))) errors.push("CSV 输出列仅支持文本、整数、数字和是 / 否；请将对象或列表转换为平级列");
  return errors;
}
type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; description?: string; enum?: unknown[]; items?: Schema; $ref?: string; anyOf?: unknown; oneOf?: unknown; allOf?: unknown; additionalProperties?: unknown };
export function importOutputSchema(source: string): { fields: OutputShapeField[]; changes: string[] } {
  const schema: Schema = JSON.parse(source);
  if (schema.type !== "object" || !schema.properties) throw new Error("请粘贴包含 properties 的 object 类型 JSON Schema");
  const fields: OutputShapeField[] = [];
  const changes: string[] = [];
  const visit = (item: Schema, path: string[], required: boolean) => {
    if (!item || typeof item !== "object" || item.$ref || item.anyOf || item.oneOf || item.allOf || Array.isArray(item.type)) throw new Error("当前导入不支持引用或组合结构，请先转换为明确的字段类型");
    if (item.properties || item.type === "object") {
      if (!item.properties || !Object.keys(item.properties).length || (path.length && item.additionalProperties && item.additionalProperties !== false)) throw new Error("动态或空对象无法确定输出列，请先明确对象字段");
      const unsupported = Object.keys(item).filter((name) => !["type", "properties", "required", "description", "title", "additionalProperties"].includes(name));
      if (unsupported.length) throw new Error(`对象 ${path.join(".") || "根节点"} 含暂不支持的约束 ${unsupported.join("、")}`);
      if (!path.length && item.additionalProperties !== false) changes.push("未列出的字段将被禁止，输出只包含已配置列");
      Object.entries(item.properties).forEach(([key, value]) => visit(value, [...path, key], required && (item.required ?? []).includes(key)));
      return;
    }
    const key = path.join("_");
    if (path.length > 1) changes.push(`${path.join(".")} → ${key}`);
    if (item.type === "array") changes.push(`${path.join(".")}：列表改为文本列，多个值用逗号分隔`);
    const type = ({ string: "String", integer: "Int", number: "Float", boolean: "Boolean", array: "String" } as Record<string, string>)[item.type ?? ""];
    if (!type) throw new Error(`字段 ${path.join(".")} 的类型不明确或暂不支持`);
    // Constraints that cannot be represented must be rejected, never silently lost.
    const supported = new Set(["type", "description", "title", "enum", "items"]);
    const extra = Object.keys(item).filter((name) => !supported.has(name));
    if (extra.length) throw new Error(`字段 ${path.join(".")} 含暂不支持的约束 ${extra.join("、")}，请在原 Schema 中保留并由研发确认`);
    if (item.enum && (type !== "String" || item.enum.some((value) => typeof value !== "string"))) throw new Error(`字段 ${key} 暂只支持文本可选值`);
    if (item.type === "array" && (item.items?.type !== "string" || Object.keys(item.items).some((name) => name !== "type"))) throw new Error(`字段 ${key} 的列表包含复杂或非文本内容，无法直接转为文本列`);
    fields.push({ key, type, required, description: `${item.description ?? ""}${item.type === "array" ? "（多个值用逗号分隔）" : ""}`, ...(item.enum ? { choices: item.enum.map(String) } : {}) });
  };
  visit(schema, [], true);
  const errors = outputShapeErrors(fields);
  if (errors.length) throw new Error(errors.join("；"));
  return { fields, changes };
}
