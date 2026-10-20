"use client";

import { Bot } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Card, CardContent } from "./card";

// Adapted from the supplied assistant card: a quiet welcome, flexible feed,
// and one composer. Model switching, attachments and shortcuts are omitted.
export function AiAssistantCard({ header, context, empty, children, composer, feedRef }: {
  header: ReactNode; context: ReactNode; empty: boolean; children: ReactNode;
  composer: ReactNode; feedRef: Ref<HTMLDivElement>;
}) {
  return <Card className="p2-assistant-card">
    {header}{context}
    <CardContent ref={feedRef} className="p2-assistant-feed" aria-label="诊断对话记录" aria-live="polite">
      {empty ? <div className="p2-assistant-welcome"><span><Bot size={26} strokeWidth={1.6} /></span><h2>Diagnoser</h2></div> : children}
    </CardContent>
    {composer}
  </Card>;
}
