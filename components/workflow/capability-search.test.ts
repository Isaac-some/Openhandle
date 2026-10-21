import { afterEach, describe, expect, it, vi } from "vitest";
import { candidates, customFlowV1, flowSource } from "./capability-catalog";
import { analyzeHit, demoSearchAdapter, directSearch, eligibleCandidates, lineageSearch, relatedSearch, SearchScope, selectCapabilityVersion, type SearchRequest } from "./capability-search";

function request(query: string, mode: SearchRequest["mode"] = "operator"): SearchRequest {
  return { requestId: 1, query, mode, filters: { source: "all", domain: "all" } };
}
afterEach(() => vi.useRealTimers());
describe("independent capability retrieval", () => {
  it("keeps operators and reusable flows in separate candidate sets", () => {
    expect(eligibleCandidates(candidates, request("视频")).every((item) => item.kind === "node")).toBe(true);
    expect(eligibleCandidates(candidates, request("视频", "flow")).every((item) => item.kind === "flow")).toBe(true);
  });
  it("returns an exact identifier immediately, including grouped model identities", () => {
    expect(directSearch(candidates, request("csv.unique"))[0].candidate.id).toBe("csv.unique");
    expect(directSearch(candidates, request("ai-platform.qwen_tmp1"))[0].candidate.id).toBe("purpose.understanding");
    expect(directSearch(candidates, request("ai-platform.qwen_tmp1"))[0].candidate.operatorId).toBe("ai-platform.qwen_tmp1");
    expect(directSearch(candidates, request("ai-platform.seedream.img2img"))[0].candidate.id).toBe("purpose.generation");
  });
  it("handles aliases, misspellings and regex-like input without executing it", () => {
    expect(directSearch(candidates, request("去重"))[0].candidate.id).toBe("csv.unique");
    expect(directSearch(candidates, request("csv.uniqe"))[0].candidate.id).toBe("csv.unique");
    expect(directSearch(candidates, request("[.*"))).toEqual([]);
  });
  it("recovers a business phrase absent from literal text and excludes earlier identities", () => {
    const r = request("去掉重复数据");
    expect(directSearch(candidates, r)).toEqual([]);
    expect(relatedSearch(candidates, r).map((hit) => hit.candidate.id)).toContain("csv.unique");
    expect(relatedSearch(candidates, r, ["csv.unique"])).toEqual([]);
  });
  it("filters unavailable, unauthorized and unpublished data at every retrieval stage", () => {
    const source = candidates.find((item) => item.id === "csv.unique")!;
    for (const restriction of [{ authorized: false }, { available: false }, { published: false }]) {
      const blocked = { ...source, ...restriction };
      expect(directSearch([blocked], request("csv.unique"))).toEqual([]);
      expect(relatedSearch([blocked], request("去掉重复数据"))).toEqual([]);
      expect(selectCapabilityVersion(blocked)).toBeNull();
    }
  });
  it("keeps the selected old version and rejects unknown versions", () => {
    const candidate = candidates.find((item) => item.id === customFlowV1.id)!;
    const selected = selectCapabilityVersion(candidate, "V1")!;
    expect(selected.flow).toEqual(customFlowV1);
    expect(JSON.stringify(selected.flow)).toContain("720p");
    expect(selectCapabilityVersion(candidate, "V0")).toBeNull();
  });
  it("uses actual directed edges as lineage, never mere co-occurrence", () => {
    const r = { ...request(""), sourceOperatorId: "vod.upload.tos" };
    const hits = lineageSearch(candidates, flowSource, r);
    expect(hits.some((hit) => hit.candidate.id === "purpose.understanding")).toBe(true);
    expect(hits[0].evidence?.join(" ")).toContain("transfer.tos_path → label.tos_path");
    const withoutEdges = flowSource.map((flow) => ({ ...flow, edges: [] }));
    expect(lineageSearch(candidates, withoutEdges, r)).toEqual([]);
  });
  it("explains real configuration differences without applying proposed changes", () => {
    const candidate = candidates.find((item) => item.id === customFlowV1.id)!;
    const selected = selectCapabilityVersion(candidate, "V1")!;
    const before = JSON.stringify(selected);
    const analysis = analyzeHit({ candidate: selected, reason: "test" }, request("生成预览，改成 480p", "flow"));
    expect(analysis.differences.join(" ")).toContain("720p");
    expect(analysis.differences.join(" ")).toContain("480p");
    expect(JSON.stringify(selected)).toBe(before);
  });
  it("does not fabricate a semantic match for an unknown business request", () => {
    expect(relatedSearch(candidates, request("把合同送到月球"))).toEqual([]);
  });
});
describe("delayed stages and cancellation", () => {
  it("keeps direct search available while related retrieval is pending", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const r = request("csv.unique");
    let finished = false;
    const promise = demoSearchAdapter.related(candidates, r, ["csv.unique"], controller.signal, "normal").then(() => { finished = true; });
    expect(directSearch(candidates, r)[0].candidate.id).toBe("csv.unique");
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    await promise;
    expect(finished).toBe(true);
  });
  it("invalidates old work when a query is superseded or the panel closes", async () => {
    vi.useFakeTimers();
    const scope = new SearchScope();
    const old = scope.begin();
    const promise = demoSearchAdapter.related(candidates, request("去掉重复数据"), [], old.signal, "normal").catch((error: Error) => error.name);
    const current = scope.begin();
    expect(scope.isCurrent(old.id)).toBe(false);
    expect(scope.isCurrent(current.id)).toBe(true);
    expect(await promise).toBe("AbortError");
    scope.invalidate();
    expect(scope.isCurrent(current.id)).toBe(false);
  });
  it("permits deep retrieval beyond five seconds and reports stages, not percentages", async () => {
    vi.useFakeTimers();
    const scope = new SearchScope();
    const ticket = scope.begin();
    const phases: string[] = [];
    let completed = false;
    const promise = demoSearchAdapter.deep(candidates, request("生成预览，改成 720p", "flow"), ticket.signal, "normal", (phase) => phases.push(phase)).then((hits) => { completed = true; return hits; });
    await vi.advanceTimersByTimeAsync(5100);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1200);
    expect((await promise).length).toBeGreaterThan(0);
    expect(phases).toEqual(["比对步骤、版本与配置", "整理匹配依据与待核对项"]);
  });
  it("cancels deep retrieval before publication of a result", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const promise = demoSearchAdapter.deep(candidates, request("视频", "flow"), controller.signal, "normal", () => {}).catch((error: Error) => error.name);
    await vi.advanceTimersByTimeAsync(2500);
    controller.abort();
    expect(await promise).toBe("AbortError");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("exposes an explicit failure so it cannot be confused with no matches", async () => {
    vi.useFakeTimers();
    const promise = demoSearchAdapter.related(candidates, request("csv.unique"), [], new AbortController().signal, "error").catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(1400);
    expect(await promise).toContain("失败");
  });
});
