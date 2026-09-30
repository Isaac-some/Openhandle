import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import { WorkflowBuilder } from "@/components/workflow/workflow-builder";
import { Phase2Prototype } from "@/components/workflow/phase2-prototype";

const root = document.getElementById("root");

if (!root) throw new Error("Missing application root");

createRoot(root).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get("prototype") === "phase2" ? <Phase2Prototype /> : <WorkflowBuilder />}
  </StrictMode>,
);
