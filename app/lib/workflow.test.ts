import { describe, expect, it } from "vitest";
import {
  createInitialWorkflow,
  createNode,
  controls,
  getAggregateCompatibility,
  getConnectionStatus,
  getDataConservationStatus,
  getNodeOutputFields,
  getOperator,
  getOperatorCategory,
  getOperatorRoutes,
  getRecommendedOperatorIds,
  instantiateFlow,
  operators,
  publishedFlows,
  shiftNodesForConditionGrowth,
  validateWorkflow,
  wouldCreateCycle,
} from "./workflow";

describe("workflow validation", () => {
  it("accepts the seeded media validation workflow", () => {
    const workflow = createInitialWorkflow();
    expect(validateWorkflow(workflow.nodes, workflow.edges).filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("starts the seeded workflow from one explicit start node", () => {
    const workflow = createInitialWorkflow();
    const starts = workflow.nodes.filter((node) => node.data.operatorId === "control.start");

    expect(starts).toHaveLength(1);
    expect(workflow.edges).toContainEqual(expect.objectContaining({ source: starts[0].id, target: "node-list" }));
  });

  it("keeps external callback support out of the default canvas", () => {
    const workflow = createInitialWorkflow();

    expect(controls).toEqual(expect.arrayContaining([expect.objectContaining({ id: "control.wait" })]));
    expect(workflow.nodes.some((node) => node.data.operatorId === "control.wait")).toBe(false);
    expect(workflow.nodes.some((node) => node.id === "node-human")).toBe(false);
  });

  it("exposes condition and split as real controls with named routes", () => {
    expect(controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "control.condition" }),
      expect.objectContaining({ id: "control.split" }),
    ]));
    expect(getOperatorRoutes("control.condition")).toEqual([
      { id: "if", label: "If" },
      { id: "else-if", label: "Else-if" },
      { id: "else", label: "Else" },
    ]);
    expect(getOperatorRoutes("control.split")).toEqual([
      { id: "A", label: "A" },
      { id: "B", label: "B" },
    ]);
    expect(getOperatorRoutes("control.filter")).toEqual([
      { id: "keep", label: "保留" },
      { id: "discard", label: "筛除" },
    ]);
  });

  it("supports up to ten ordered condition rules plus a mandatory Else route", () => {
    const condition = createNode(getOperator("control.condition")!, "condition", { x: 0, y: 0 });
    condition.data.config["分流规则"] = Array.from({ length: 10 }, (_, index) => ({
      id: `rule-${index + 1}`,
      label: `分流 ${index + 1}`,
      expression: `score == ${index + 1}`,
    }));

    expect(getOperatorRoutes("control.condition", condition.data.config)).toHaveLength(11);
    expect(getOperatorRoutes("control.condition", condition.data.config).at(-1)).toEqual({ id: "else", label: "Else" });
  });

  it("makes room below a condition when additional route rows increase its height", () => {
    const condition = createNode(getOperator("control.condition")!, "condition", { x: 100, y: 100 });
    const below = createNode(getOperator("tos.list")!, "below", { x: 180, y: 350 });
    const otherColumn = createNode(getOperator("tos.list")!, "other", { x: 500, y: 350 });
    const shifted = shiftNodesForConditionGrowth([condition, below, otherColumn], condition.id, 96);

    expect(shifted.find((node) => node.id === below.id)?.position.y).toBe(446);
    expect(shifted.find((node) => node.id === otherColumn.id)?.position.y).toBe(350);
  });

  it("rejects a workflow without a start or with an upstream connection into start", () => {
    const workflow = createInitialWorkflow();
    expect(validateWorkflow(workflow.nodes.filter((node) => node.data.operatorId !== "control.start"), workflow.edges.filter((edge) => edge.source !== "node-start"))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "missing-start" }),
    ]));

    workflow.edges.push({ id: "back-to-start", source: "node-list", target: "node-start" });
    expect(validateWorkflow(workflow.nodes, workflow.edges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "start-has-upstream-node-start" }),
    ]));
  });

  it("classifies every business operator into one of the four displayed types", () => {
    const categories = new Set(["enrich", "filter", "transform", "io"]);
    const handlers = operators.filter((operator) => operator.kind === "handler");

    expect(handlers).toHaveLength(54);
    expect(handlers.every((operator) => categories.has(String(getOperatorCategory(operator))))).toBe(true);
    expect(getOperatorCategory(getOperator("ai-platform.deepseek")!)).toBe("enrich");
    expect(getOperatorCategory(getOperator("eval.filter")!)).toBe("filter");
    expect(getOperatorCategory(getOperator("vod.frame.extract")!)).toBe("transform");
    expect(getOperatorCategory(getOperator("tos.list")!)).toBe("io");
  });

  it("keeps inferred branch semantics out of the frontend graph", () => {
    const workflow = createInitialWorkflow();
    const inferredRelations = new Set(["control.condition", "control.split"]);

    expect(workflow.edges.some((edge) => inferredRelations.has(String(edge.data?.relationOperatorId)))).toBe(false);
  });

  it("locates a missing required field on the node and field", () => {
    const node = createNode(getOperator("image.resize")!, "resize", { x: 0, y: 0 });
    const result = createNode(getOperator("control.result")!, "result", { x: 300, y: 0 });
    result.data.mappings.result = { sourceType: "upstream", sourceNodeId: node.id, sourceField: "image_resize_tos_path" };
    const issues = validateWorkflow([node, result], [{ id: "edge", source: node.id, target: result.id }]);
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: "resize", fieldKey: "tos_path" })]));
  });

  it("blocks cycles", () => {
    const workflow = createInitialWorkflow();
    workflow.edges.push({ id: "cycle", source: "node-result", target: "node-list" });
    expect(validateWorkflow(workflow.nodes, workflow.edges)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "cycle" })]));
  });

  it("rejects a new connection as soon as it would point back to an ancestor", () => {
    const workflow = createInitialWorkflow();
    expect(wouldCreateCycle(workflow.nodes, workflow.edges, "node-result", "node-list")).toBe(true);
    expect(wouldCreateCycle(workflow.nodes, workflow.edges, "node-list", "node-result")).toBe(false);
  });

  it("requires every named condition route to reach a result", () => {
    const source = createNode(getOperator("tos.list")!, "source", { x: 0, y: 0 });
    source.data.mappings.dir = { sourceType: "fixed", value: "tos://input" };
    const condition = createNode(getOperator("control.condition")!, "condition", { x: 250, y: 0 });
    condition.data.mappings.resource = { sourceType: "upstream", sourceNodeId: source.id, sourceField: "tos_path" };
    const results = ["if", "else-if", "else"].map((route, index) => {
      const result = createNode(getOperator("control.result")!, `result-${route}`, { x: 520, y: index * 160 });
      result.data.mappings.result = { sourceType: "upstream", sourceNodeId: condition.id, sourceField: "tos_path" };
      return result;
    });
    const routeEdges = ["if", "else-if", "else"].map((route, index) => ({
      id: `edge-${route}`,
      source: condition.id,
      sourceHandle: route,
      target: results[index].id,
      data: { routeId: route, routeLabel: route === "if" ? "If" : route === "else-if" ? "Else-if" : "Else" },
    }));
    const edges = [{ id: "source-condition", source: source.id, target: condition.id }, ...routeEdges];

    expect(validateWorkflow([source, condition, ...results], edges).some((issue) => issue.id.startsWith("missing-route-") || issue.id.startsWith("route-without-result-"))).toBe(false);

    const missingElse = edges.filter((edge) => edge.id !== "edge-else");
    expect(validateWorkflow([source, condition, ...results], missingElse)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "missing-route-condition-else", nodeId: "condition" }),
    ]));
  });

  it("allows every route from one condition to terminate at the same end node", () => {
    const source = createNode(getOperator("tos.list")!, "source", { x: 0, y: 0 });
    source.data.mappings.dir = { sourceType: "fixed", value: "tos://input" };
    const condition = createNode(getOperator("control.condition")!, "condition", { x: 250, y: 0 });
    condition.data.mappings.resource = { sourceType: "upstream", sourceNodeId: source.id, sourceField: "tos_path" };
    const end = createNode(getOperator("control.result")!, "end", { x: 520, y: 0 });
    const routes = getOperatorRoutes("control.condition", condition.data.config);
    const edges = [
      { id: "source-condition", source: source.id, target: condition.id },
      ...routes.map((route) => ({ id: `edge-${route.id}`, source: condition.id, sourceHandle: route.id, target: end.id, data: { routeId: route.id, routeLabel: route.label } })),
    ];

    const issues = validateWorkflow([source, condition, end], edges);
    expect(issues.some((issue) => issue.id.startsWith("implicit-merge-") || issue.id.startsWith("missing-route-") || issue.id.startsWith("route-without-result-"))).toBe(false);
  });

  it("carries inherited fields through a filter without removing them", () => {
    const source = createNode(getOperator("cnclip.watermark")!, "source", { x: 0, y: 0 });
    const filter = createNode(getOperator("eval.filter")!, "filter", { x: 300, y: 0 });
    filter.data.mappings["<比较字段值>"] = { sourceType: "upstream", sourceNodeId: source.id, sourceField: "logo" };
    const edges = [{ id: "edge", source: source.id, target: filter.id }];

    expect(getNodeOutputFields(filter.id, [source, filter], edges).map((field) => field.key)).toEqual(
      getNodeOutputFields(source.id, [source, filter], edges).map((field) => field.key),
    );
  });

  it("allows aggregation only when both complete field schemas are identical", () => {
    const left = createNode(getOperator("tos.list")!, "left", { x: 0, y: 0 });
    const right = createNode(getOperator("tos.list")!, "right", { x: 0, y: 200 });
    const different = createNode(getOperator("cnclip.watermark")!, "different", { x: 0, y: 400 });

    expect(getAggregateCompatibility([left.id, right.id], [left, right], [])).toEqual(expect.objectContaining({ compatible: true }));
    expect(getAggregateCompatibility([left.id, different.id], [left, different], [])).toEqual(expect.objectContaining({ compatible: false }));
  });

  it("locates an aggregate schema mismatch on the aggregate node", () => {
    const left = createNode(getOperator("tos.list")!, "left", { x: 0, y: 0 });
    const right = createNode(getOperator("cnclip.watermark")!, "right", { x: 0, y: 200 });
    const aggregate = createNode(getOperator("control.aggregate")!, "aggregate", { x: 300, y: 100 });
    const edges = [
      { id: "left-aggregate", source: left.id, target: aggregate.id },
      { id: "right-aggregate", source: right.id, target: aggregate.id },
    ];

    expect(validateWorkflow([left, right, aggregate], edges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "aggregate-schema-aggregate", nodeId: "aggregate" }),
    ]));
  });

  it("allows multiple lines to share an end node without treating it as aggregation", () => {
    const left = createNode(getOperator("tos.list")!, "left", { x: 0, y: 0 });
    const right = createNode(getOperator("tos.list")!, "right", { x: 0, y: 200 });
    const result = createNode(getOperator("control.result")!, "result", { x: 300, y: 100 });
    const edges = [
      { id: "left-result", source: left.id, target: result.id },
      { id: "right-result", source: right.id, target: result.id },
    ];

    expect(validateWorkflow([left, right, result], edges).some((issue) => issue.id === "implicit-merge-result")).toBe(false);
  });

  it("still requires an explicit aggregate when two lines continue into an ordinary node", () => {
    const left = createNode(getOperator("tos.list")!, "left", { x: 0, y: 0 });
    const right = createNode(getOperator("tos.list")!, "right", { x: 0, y: 200 });
    const next = createNode(getOperator("vod.video.get")!, "next", { x: 300, y: 100 });
    const result = createNode(getOperator("control.result")!, "result", { x: 600, y: 100 });
    const edges = [
      { id: "left-next", source: left.id, target: next.id },
      { id: "right-next", source: right.id, target: next.id },
      { id: "next-result", source: next.id, target: result.id },
    ];

    expect(validateWorkflow([left, right, next, result], edges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "implicit-merge-next" }),
    ]));
  });

  it("detects missing and duplicate resources across terminal outcomes", () => {
    expect(getDataConservationStatus(["a", "b", "c"], { "输出结果": ["a", "b"], "筛除": ["c"] })).toEqual(expect.objectContaining({ complete: true, inputCount: 3, terminalCount: 3 }));
    expect(getDataConservationStatus(["a", "b", "c"], { "输出结果": ["a", "b"], "筛除": ["b"] })).toEqual(expect.objectContaining({
      complete: false,
      missingIds: ["c"],
      duplicateIds: ["b"],
    }));
  });

  it("detects an incompatible output and input before the workflow is generated", () => {
    const status = getConnectionStatus(
      getOperator("image.resize"),
      getOperator("control.split"),
      "image_resize_tos_path",
      "resources",
    );
    expect(status.compatible).toBe(false);
    expect(status.reason).toContain("无法直接连接");
  });

  it("treats an explicit edge relation as the mismatch resolution", () => {
    const source = createNode(getOperator("image.resize")!, "source", { x: 0, y: 0 });
    source.data.mappings.tos_path = { sourceType: "fixed", value: "tos://image.png" };
    const target = createNode(getOperator("hbase.set")!, "target", { x: 300, y: 0 });
    target.data.mappings.rowkey = { sourceType: "upstream", sourceNodeId: source.id, sourceField: "image_resize_tos_path" };
    const edge = {
      id: "edge-with-relation",
      source: source.id,
      target: target.id,
      data: { fields: ["image_resize_tos_path → rowkey"], relationOperatorId: "control.transform" as const },
    };

    const issues = validateWorkflow([source, target], [edge]);
    expect(issues.some((issue) => issue.id === "type-mismatch-target-rowkey")).toBe(false);
  });

  it("blocks unsafe QPS values before save or launch", () => {
    const workflow = createInitialWorkflow();
    const frames = workflow.nodes.find((node) => node.data.operatorId === "vod.frame.extract")!;
    frames.data.config["阶段QPS"] = 1_000_000;
    expect(validateWorkflow(workflow.nodes, workflow.edges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "unsafe-config-node-frames-阶段QPS", level: "error" }),
    ]));
  });

  it("expands a Flow into its real node group", () => {
    const flow = publishedFlows.find((item) => item.id === "flow.remove-watermark-videos")!;
    const instance = instantiateFlow(flow, "watermark-flow", { x: 40, y: 80 });

    expect(publishedFlows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "flow.remove-watermark-videos", version: "v1.0.0" }),
    ]));
    expect(instance.nodes.map((node) => node.data.operatorId)).toEqual(["flow.remove-watermark-videos", "cnclip.watermark", "eval.filter"]);
    expect(instance.edges).toHaveLength(1);
    expect(instance.nodes[0]).toEqual(expect.objectContaining({
      type: "flowGroup",
      data: expect.objectContaining({ kind: "flow", flowLocked: true }),
    }));
    expect(instance.nodes.slice(1).every((node) => node.parentId === "watermark-flow" && node.draggable === false)).toBe(true);
  });

  it("offers four reusable Flows grounded in existing operator sequences", () => {
    expect(publishedFlows).toHaveLength(4);
    expect(publishedFlows.map((flow) => flow.id)).toEqual(expect.arrayContaining([
      "flow.remove-watermark-videos",
      "flow.human-review",
      "flow.video-metadata-validation",
      "flow.video-preview",
    ]));
    expect(publishedFlows.every((flow) => flow.nodes.every((node) => Boolean(getOperator(node.operatorId))))).toBe(true);
  });

  it("only recommends quick additions for a non-result node without downstream edges", () => {
    const workflow = createInitialWorkflow();
    expect(getRecommendedOperatorIds("node-list", workflow.nodes, workflow.edges)).toEqual([]);
    expect(getRecommendedOperatorIds("node-result", workflow.nodes, workflow.edges)).toEqual([]);

    const isolated = createNode(getOperator("tos.list")!, "isolated-list", { x: 0, y: 0 });
    expect(getRecommendedOperatorIds(isolated.id, [isolated], [])).not.toEqual([]);

    const deepseek = createNode(getOperator("ai-platform.deepseek")!, "isolated-deepseek", { x: 0, y: 0 });
    expect(getRecommendedOperatorIds(deepseek.id, [deepseek], [])[0]).toBe("eval.filter");
  });
});
