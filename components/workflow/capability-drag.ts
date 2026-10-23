import { canUseCapability, selectCapabilityVersion, type Capability } from "./capability-search";

export const CAPABILITY_DRAG_MIME = "application/workflow-capability";
type CapabilityDrag = { id: string; kind: Capability["kind"]; version?: string; operatorId?: string };

export function capabilityDragData(candidate: Capability): string {
  const payload: CapabilityDrag = { id: candidate.id, kind: candidate.kind };
  if (candidate.flow) payload.version = candidate.flow.version;
  if (candidate.operatorId) payload.operatorId = candidate.operatorId;
  return JSON.stringify(payload);
}

// Resolve identity and version from the current catalog, never trust dragged descriptions or permissions.
export function resolveCapabilityDrop(value: string, candidates: Capability[]): Capability | null {
  try {
    const payload: unknown = JSON.parse(value);
    if (!payload || typeof payload !== "object" || !("id" in payload) || typeof payload.id !== "string" || !("kind" in payload)) return null;
    const candidate = candidates.find((item) => item.id === payload.id && item.kind === payload.kind);
    if (!candidate || !canUseCapability(candidate)) return null;
    if (candidate.flow && (!("version" in payload) || typeof payload.version !== "string")) return null;
    const resolved = selectCapabilityVersion(candidate, "version" in payload && typeof payload.version === "string" ? payload.version : undefined);
    if (!resolved) return null;
    if ("operatorId" in payload && payload.operatorId !== resolved.operatorId) return null;
    return resolved;
  } catch { return null; }
}
