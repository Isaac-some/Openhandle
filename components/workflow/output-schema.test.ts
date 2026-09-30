import { describe, expect, it } from "vitest";
import { buildOutputSchema, importOutputSchema, outputShapeErrors } from "./output-schema";

describe("flat AI output schema", () => {
  it("flattens nested objects and marks a child optional when its parent is optional", () => {
    const { fields, changes } = importOutputSchema(JSON.stringify({
      type: "object", required: ["title"], properties: {
        title: { type: "string" },
        video: { type: "object", required: ["duration"], properties: { duration: { type: "integer" } } },
      },
    }));
    expect(fields.map(({ key, type, required }) => ({ key, type, required }))).toEqual([
      { key: "title", type: "String", required: true },
      { key: "video_duration", type: "Int", required: false },
    ]);
    expect(changes).toContain("video.duration → video_duration");
    const schema = buildOutputSchema(fields);
    expect(schema.properties.video_duration).toMatchObject({ type: "integer" });
    expect(schema.required).toEqual(["title"]);
  });

  it("makes list conversion explicit and rejects unsupported constraints", () => {
    const result = importOutputSchema(JSON.stringify({ type: "object", properties: { keywords: { type: "array", items: { type: "string" } } } }));
    expect(result.fields[0]).toMatchObject({ key: "keywords", type: "String" });
    expect(result.changes.some((change) => change.includes("列表改为文本列"))).toBe(true);
    expect(() => importOutputSchema(JSON.stringify({ type: "object", properties: { title: { type: "string", maxLength: 20 } } }))).toThrow("暂不支持的约束");
  });

  it("blocks duplicate, nested or unsupported output columns", () => {
    expect(outputShapeErrors([
      { key: "title", type: "String", required: true, description: "" },
      { key: "title", type: "Object", required: false, description: "" },
    ])).toHaveLength(2);
    expect(outputShapeErrors([{ key: "video.title", type: "String", required: true, description: "" }])).toContain("列名使用英文字母、数字和下划线，不能嵌套或含空格");
  });
});
