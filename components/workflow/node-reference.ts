/** Clipboard references carry identity only; display names never resolve a node. */
export const NODE_REFERENCE_MIME = "application/x-workflow-node-reference+json";
export const prototypeReferenceScope = { projectId: "demo-project", workflowId: "video-labeling-prototype" };
export const nodeReferenceIcons = ["workflow", "image", "bot", "play", "output", "split", "branch", "video", "layers"] as const;
export type NodeReferenceIcon = typeof nodeReferenceIcons[number];
export type NodeReference = {
  version: 1; projectId: string; workflowId: string; nodeId: string; revision: number; label: string; icon?: NodeReferenceIcon; field?: { direction: "inputs" | "outputs" | "csv"; path: string };
};
export type NodeReferenceContext = {
  projectId?: string; workflowId?: string; revision: number; nodes: { id: string; label: string; icon?: NodeReferenceIcon; fields?: { inputs?: string[]; outputs?: string[]; csv?: string[] } }[];
};
export function nodeReferenceKey(reference: NodeReference) {
  return JSON.stringify([reference.projectId, reference.workflowId, reference.nodeId, reference.revision, reference.field?.direction, reference.field?.path]);
}
export function createNodeReference(context: NodeReferenceContext, nodeId: string): NodeReference | null {
  const node = context.nodes.find((item) => item.id === nodeId);
  return node ? { version: 1, projectId: context.projectId ?? prototypeReferenceScope.projectId, workflowId: context.workflowId ?? prototypeReferenceScope.workflowId, nodeId, revision: context.revision, label: node.label, ...(node.icon ? { icon: node.icon } : {}) } : null;
}
export function encodeNodeReference(reference: NodeReference): string {
  const url = new URL("workflow-node://reference");
  for (const [key, value] of Object.entries(reference)) if (key !== "field") url.searchParams.set(key, String(value));
  if (reference.field) { url.searchParams.set("direction", reference.field.direction); url.searchParams.set("path", reference.field.path); }
  return url.toString();
}
export function parseNodeReference(text: string): NodeReference | null {
  try {
    let value: Record<string, unknown>;
    if (text.trim().startsWith("workflow-node://")) {
      const url = new URL(text.trim());
      if (url.protocol !== "workflow-node:" || url.hostname !== "reference") return null;
      value = Object.fromEntries(url.searchParams);
    } else {
      value = JSON.parse(text);
    }
    if (!value || typeof value !== "object" || String(value.version) !== "1") return null;
    if (!["projectId", "workflowId", "nodeId", "label"].every((key) => typeof value[key] === "string" && !!String(value[key]).trim() && String(value[key]).length <= 500)) return null;
    const revision = Number(value.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) return null;
    const fieldValue = value.field as Record<string, unknown> | undefined;
    const direction = fieldValue?.direction ?? value.direction;
    const path = fieldValue?.path ?? value.path;
    if (direction !== undefined && (!["inputs", "outputs", "csv"].includes(String(direction)) || typeof path !== "string" || !path.trim() || path.length > 500)) return null;
    const field = direction ? { direction: direction as "inputs" | "outputs" | "csv", path: String(path) } : undefined;
    const icon = nodeReferenceIcons.find((item) => item === value.icon);
    return { version: 1, projectId: String(value.projectId), workflowId: String(value.workflowId), nodeId: String(value.nodeId), label: String(value.label), revision, ...(icon ? { icon } : {}), ...(field ? { field } : {}) };
  } catch { return null; }
}
export function readNodeReferencePaste(custom: string, text: string, context: NodeReferenceContext): NodeReference | null {
  const structured = parseNodeReference(custom) ?? parseNodeReference(text);
  if (structured) return structured;
  // A bare ID is accepted only inside this explicit diagnostic context, never by name.
  const token = text.trim();
  const fieldMatches: NodeReference[] = [];
  for (const node of context.nodes) {
    for (const direction of ["inputs", "outputs", "csv"] as const) {
      for (const path of node.fields?.[direction] ?? []) {
        const reference = createFieldReference(context, node.id, direction, path)!;
        if (referenceToken(reference) === token) fieldMatches.push(reference);
      }
    }
  }
  if (fieldMatches.length) return fieldMatches.length === 1 ? fieldMatches[0] : null;
  const matches = context.nodes.filter((node) => node.id === token || `{${node.id}}` === token);
  return matches.length === 1 ? createNodeReference(context, matches[0].id) : null;
}
export function resolveNodeReference(reference: NodeReference, context: NodeReferenceContext, liveNodeIds?: string[]) {
  if (reference.projectId !== (context.projectId ?? prototypeReferenceScope.projectId) || reference.workflowId !== (context.workflowId ?? prototypeReferenceScope.workflowId)) return { valid: false, reason: "引用来自其他项目或工作流，请切换对应诊断记录。" };
  if (reference.revision !== context.revision) return { valid: false, reason: `引用属于快照 ${reference.revision}，当前诊断为快照 ${context.revision}；请切换对应记录。` };
  const node = context.nodes.find((item) => item.id === reference.nodeId);
  if (!node) return { valid: false, reason: "该节点不在本次诊断快照中，无法按名称替换。" };
  if (liveNodeIds && !liveNodeIds.includes(reference.nodeId)) return { valid: false, reason: "该节点已从当前草稿删除，引用已保留，请核对历史现场。" };
  if (reference.field && !node.fields?.[reference.field.direction]?.includes(reference.field.path)) return { valid: false, reason: "原字段已失效，引用仍保留；不会替换为同名字段。", node };
  return { valid: true, reason: "", node };
}
export function mergeNodeReferences(current: NodeReference[], incoming: NodeReference[]) {
  const keys = new Set(current.map(nodeReferenceKey));
  return [...current, ...incoming.filter((reference) => { const key = nodeReferenceKey(reference); if (keys.has(key)) return false; keys.add(key); return true; })];
}
export function canCopyCanvasNode(options: { canvasFocused: boolean; editingText: boolean; selectedText: boolean; selectionCount: number }) {
  return options.canvasFocused && !options.editingText && !options.selectedText && options.selectionCount === 1;
}

/** Plain clipboard syntax is the first-release contract, independent of Diagnoser. */
export function referenceToken(reference: NodeReference) {
  if (!reference.field) return `{${reference.nodeId}}`;
  const { direction, path } = reference.field;
  return direction === "csv" ? `{csv.${path}}` : `{${reference.nodeId}.${direction}.${path}}`;
}
export function createFieldReference(context: NodeReferenceContext, nodeId: string, direction: "inputs" | "outputs" | "csv", path: string): NodeReference | null {
  const base = createNodeReference(context, nodeId);
  return base ? { ...base, field: { direction, path } } : null;
}
export const referencePattern = /\{(?:csv\.[^{}\n]+|[A-Za-z0-9_-]+(?:\.(?:inputs|outputs)\.[^{}\n]+)?)\}/g;
export function referenceParts(value: string) { return value.split(/(\{(?:csv\.[^{}\n]+|[A-Za-z0-9_-]+(?:\.(?:inputs|outputs)\.[^{}\n]+)?)\})/g).filter(Boolean); }
export function expandCsvReferences(template: string, row: Record<string, string>) {
  return template.replace(/\{csv\.([^{}\n]+)\}/g, (token, path: string) => Object.hasOwn(row, path) ? row[path] : token);
}

/** A one-pass local preview. Production resolution must use its execution context. */
export function expandFieldReferences(template: string, context: NodeReferenceContext, valueOf: (reference: NodeReference) => string | undefined) {
  return template.replace(referencePattern, (token) => {
    const reference = readNodeReferencePaste("", token, context);
    if (!reference?.field || !resolveNodeReference(reference, context).valid) throw new Error(`${token} 的字段已失效`);
    const value = valueOf(reference);
    if (value === undefined) throw new Error(`${token} 尚无本条数据的值`);
    return value;
  });
}
