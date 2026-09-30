"use client";

import { useSyncExternalStore } from "react";
import { WorkflowBuilder } from "@/components/workflow/workflow-builder";
import { Phase2Prototype } from "@/components/workflow/phase2-prototype";

export default function Home() {
  const phase2 = useSyncExternalStore(
    () => () => undefined,
    () => new URLSearchParams(window.location.search).get("prototype") === "phase2",
    () => false,
  );
  return phase2 ? <Phase2Prototype /> : <WorkflowBuilder />;
}
