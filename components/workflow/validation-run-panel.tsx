"use client";

import NextImage from "next/image";
import { Check, CheckCircle2, Clock3, Image as ImageIcon, LoaderCircle, RotateCcw, ShieldCheck, UserCheck, Video, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/app/lib/utils";

export type ValidationRunPhase = "running" | "pending" | "complete";

export interface ValidationRunState {
  phase: ValidationRunPhase;
  step: number;
  startedAt: string;
}

const steps = ["读取测试素材", "解析媒体信息", "抽取视频帧", "机器质量判断", "等待人工回传", "结束与数据守恒校验"];

const assets = [
  { name: "31334951.jpg", src: "/test-assets/pexels-hoang-ti-n-anh-2149671659-31334951.jpg", kind: "image", decision: "机器通过", score: "0.94" },
  { name: "36673592.jpg", src: "/test-assets/pexels-gabii-fernandez-199438359-36673592.jpg", kind: "image", decision: "人工复核", score: "0.76" },
  { name: "33953580.jpg", src: "/test-assets/pexels-amaurymic-33953580.jpg", kind: "image", decision: "机器通过", score: "0.91" },
  { name: "20155703.mp4", src: "/test-assets/20155703-hd_1920_1080_50fps.m4v", kind: "video", decision: "机器通过", score: "0.88" },
  { name: "5087844.mp4", src: "/test-assets/5087844-uhd_3840_2160_25fps.m4v", kind: "video", decision: "人工复核", score: "0.79" },
  { name: "演示.mp4", src: "/test-assets/demo.mov", kind: "video", decision: "机器通过", score: "0.86" },
] as const;

export function ValidationRunPanel({ run, onReview, onRestart, onClose }: { run: ValidationRunState; onReview: () => void; onRestart: () => void; onClose: () => void }) {
  const progress = run.phase === "complete" ? 100 : Math.round(((run.step + 1) / steps.length) * 100);

  return (
    <section data-validation-phase={run.phase} className="overflow-hidden rounded-[12px] border border-[var(--border-strong)] bg-white shadow-[0_8px_24px_oklch(0.2_0.02_255/0.14)]" aria-label="校验执行结果">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", run.phase === "complete" ? "bg-[oklch(0.96_0.035_155)] text-[var(--success)]" : run.phase === "pending" ? "bg-[var(--warning-soft)] text-[var(--warning-strong)]" : "bg-[oklch(0.97_0.018_255)] text-[var(--connection)]")}>{run.phase === "complete" ? <CheckCircle2 className="h-4 w-4" /> : run.phase === "pending" ? <Clock3 className="h-4 w-4" /> : <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />}</span>
          <div className="min-w-0"><h2 className="text-sm font-semibold">{run.phase === "complete" ? "校验闭环已完成" : run.phase === "pending" ? "2 条资源等待人工回传" : steps[run.step]}</h2><p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">本地测试素材 · 不调用生产资源 · {new Date(run.startedAt).toLocaleTimeString("zh-CN", { hour12: false })}</p></div>
        </div>
        <div className="flex items-center gap-2">{run.phase === "complete" && <Button size="sm" variant="outline" onClick={onRestart}><RotateCcw className="h-3.5 w-3.5" />重新校验</Button>}<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭校验执行结果"><X className="h-4 w-4" /></Button></div>
      </div>

      <div className="h-1 bg-[var(--surface-strong)]"><div className="h-full bg-[var(--success)] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>

      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)] gap-0">
        <div className="border-r border-[var(--border)] p-3">
          <div className="grid grid-cols-6 gap-2" aria-label="测试素材">
            {assets.map((asset) => {
              const needsReview = asset.decision === "人工复核";
              const settled = run.phase === "complete" || (!needsReview && run.step >= 3);
              return <article key={asset.name} className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-strong)]">
                  {asset.kind === "image" ? <NextImage src={asset.src} alt="测试图片缩略图" fill sizes="150px" className="object-cover" /> : <div className="flex h-full w-full flex-col items-center justify-center bg-[oklch(0.92_0.018_255)] text-[oklch(0.42_0.08_255)]" aria-label="测试视频文件"><Video className="h-6 w-6" /><span className="mt-1 font-mono text-[9px]">MP4</span></div>}
                  <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-white/90 text-[var(--foreground)]">{asset.kind === "image" ? <ImageIcon className="h-3 w-3" /> : <Video className="h-3 w-3" />}</span>
                  {settled && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success)] text-white"><Check className="h-3 w-3" /></span>}
                </div>
                <div className="p-2"><p className="truncate text-[10px] font-medium" title={asset.name}>{asset.name}</p><div className="mt-1.5 flex items-center justify-between gap-1"><Badge className={cn("max-w-[78px] truncate", needsReview ? "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-strong)]" : "border-[oklch(0.78_0.10_155)] bg-[oklch(0.96_0.035_155)] text-[var(--success)]")}>{run.step < 3 ? "待判断" : run.phase === "complete" && needsReview ? "人工通过" : asset.decision}</Badge><span className="font-mono text-[9px] text-[var(--muted-foreground)]">{run.step >= 3 ? asset.score : "--"}</span></div></div>
              </article>;
            })}
          </div>
        </div>

        <div className="flex min-h-[194px] flex-col p-3">
          {run.phase === "complete" ? <>
            <div className="grid grid-cols-3 gap-2"><Metric value="6" label="输入资源" /><Metric value="4" label="机器通过" /><Metric value="2" label="人工通过" /></div>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[oklch(0.78_0.10_155)] bg-[oklch(0.97_0.025_155)] p-3 text-[oklch(0.40_0.12_155)]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-xs font-semibold">6 / 6 资源已形成可追溯结局</p><p className="mt-1 text-[10px] leading-4">所有输入 ID 都在结束节点出现一次，没有空置、重复或未知数据。</p></div></div>
          </> : run.phase === "pending" ? <>
            <div className="flex flex-1 items-center gap-3 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3"><UserCheck className="h-5 w-5 shrink-0 text-[var(--warning-strong)]" /><div><p className="text-xs font-semibold">模拟标注员反馈</p><p className="mt-1 text-[10px] leading-4 text-[var(--muted-foreground)]">将两条低置信度资源按 resource_id 回传为“质量合格”。</p></div></div>
            <Button className="mt-3 w-full" onClick={onReview}><UserCheck className="h-4 w-4" />提交模拟人工回传</Button>
          </> : <>
            <ol className="space-y-1.5">{steps.map((label, index) => <li key={label} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px]", index === run.step ? "bg-[oklch(0.97_0.018_255)] font-semibold text-[var(--connection)]" : index < run.step ? "text-[var(--success)]" : "text-[var(--muted-foreground)]")}><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current">{index < run.step ? <Check className="h-2.5 w-2.5" /> : index === run.step ? <LoaderCircle className="h-2.5 w-2.5 animate-spin motion-reduce:animate-none" /> : index + 1}</span>{label}</li>)}</ol>
          </>}
        </div>
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-lg bg-[var(--surface)] px-2 py-2.5 text-center"><p className="text-base font-semibold tabular-nums">{value}</p><p className="mt-0.5 text-[9px] text-[var(--muted-foreground)]">{label}</p></div>;
}
