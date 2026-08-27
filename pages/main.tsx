import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import { WorkflowBuilder } from "@/components/workflow/workflow-builder";

const root = document.getElementById("root");

if (!root) throw new Error("Missing application root");

createRoot(root).render(
  <StrictMode>
    <WorkflowBuilder />
  </StrictMode>,
);
