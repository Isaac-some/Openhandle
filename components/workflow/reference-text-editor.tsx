"use client";

import { useLayoutEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NodeReferenceGlyph } from "./node-reference-icon";
import { NODE_REFERENCE_MIME, referenceToken, readNodeReferencePaste, referenceParts, referencePattern, resolveNodeReference, type NodeReference, type NodeReferenceContext } from "./node-reference";

// Clipboard stays plain text. Recognised tokens are indivisible in product inputs.
function read(root: Node): string {
  if (root instanceof HTMLElement && root.dataset.referenceToken) return root.dataset.referenceToken;
  if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? "";
  if (root.nodeName === "BR") return "\n";
  return Array.from(root.childNodes).map((child) => read(child) + (child.nodeName === "DIV" ? "\n" : "")).join("");
}
function fragment(text: string, context: NodeReferenceContext, rich = false, known: NodeReference[] = []) {
  const result = document.createDocumentFragment();
  for (const part of referenceParts(text)) {
    if ((part.match(referencePattern) ?? [])[0] === part) {
      const reference = known.find((item) => referenceToken(item) === part) ?? readNodeReferencePaste("", part, context);
      const span = document.createElement("span");
      span.contentEditable = "false"; span.dataset.referenceToken = part;
      span.className = `p2-text-reference ${reference && resolveNodeReference(reference, context).valid ? "" : "invalid"}`;
      if (rich && reference) {
        span.classList.add("p2-compose-reference");
        const node = context.nodes.find((node) => node.id === reference.nodeId);
        // Only our own icon component produces markup; clipboard HTML is never inserted.
        span.innerHTML = renderToStaticMarkup(<NodeReferenceGlyph icon={node?.icon ?? reference.icon} />);
        span.appendChild(document.createTextNode(`${node?.label ?? reference.label}${reference.field ? ` · ${reference.field.direction === "inputs" ? "输入" : "输出"} ${reference.field.path}` : ""}`));
        span.setAttribute("role", "link"); span.tabIndex = 0;
      } else span.textContent = part;
      span.title = reference ? `${reference.label} · ${reference.field?.path ?? reference.nodeId}（整块引用）` : "来源已失效或无法解析，保留原引用";
      result.append(span);
    } else result.append(document.createTextNode(part));
  }
  return result;
}
export function ReferenceTextEditor({ id, label, value, context, onChange, disabled, richReferences = false, references = [], placeholder, onReferencePaste, onFocusReference, onSubmit }: {
  id: string; label: string; value: string; context: NodeReferenceContext; onChange: (value: string) => void; disabled?: boolean;
  richReferences?: boolean; references?: NodeReference[]; placeholder?: string;
  onReferencePaste?: (reference: NodeReference) => void; onFocusReference?: (reference: NodeReference) => void; onSubmit?: () => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (editor.current && read(editor.current) !== value) editor.current.replaceChildren(fragment(value, context, richReferences, references));
    editor.current?.querySelectorAll<HTMLElement>("[data-reference-token]").forEach((span) => {
      const reference = references.find((item) => referenceToken(item) === span.dataset.referenceToken) ?? readNodeReferencePaste("", span.dataset.referenceToken!, context);
      span.classList.toggle("invalid", !reference || !resolveNodeReference(reference, context).valid);
    });
  });
  const commit = () => onChange(read(editor.current!));
  const focusReference = (target: EventTarget) => {
    const span = (target as HTMLElement).closest<HTMLElement>("[data-reference-token]");
    if (!span) return;
    const reference = references.find((item) => referenceToken(item) === span.dataset.referenceToken) ?? readNodeReferencePaste("", span.dataset.referenceToken!, context);
    if (reference) onFocusReference?.(reference);
  };
  return <div id={id} ref={editor} className={`p2-reference-editor ${richReferences ? "p2-rich-reference-editor" : ""}`} data-empty={!value} data-placeholder={placeholder} role="textbox" aria-label={label} aria-multiline="true" aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning onInput={commit} onClick={(event) => { if (richReferences) focusReference(event.target); }}
    onCopy={(event) => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed || !editor.current?.contains(selection.anchorNode)) return;
      event.preventDefault(); event.clipboardData.setData("text/plain", read(selection.getRangeAt(0).cloneContents()));
    }}
    onPaste={(event) => {
      event.preventDefault(); let text = event.clipboardData.getData("text/plain");
      const reference = readNodeReferencePaste(event.clipboardData.getData(NODE_REFERENCE_MIME), text, context);
      if (richReferences && reference) { text = referenceToken(reference); onReferencePaste?.(reference); }
      const selection = window.getSelection(); if (!selection) return;
      const range = selection.rangeCount && editor.current!.contains(selection.anchorNode) ? selection.getRangeAt(0) : document.createRange();
      if (!editor.current!.contains(range.commonAncestorContainer)) { range.selectNodeContents(editor.current!); range.collapse(false); }
      range.deleteContents(); const content = fragment(text, context, richReferences, reference ? [...references, reference] : references); const last = content.lastChild;
      range.insertNode(content); if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
      commit();
    }} onKeyDown={(event) => {
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        if ((event.target as HTMLElement).closest("[data-reference-token]")) { event.preventDefault(); focusReference(event.target); return; }
        if (onSubmit && !event.shiftKey) { event.preventDefault(); onSubmit(); return; }
      }
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const selection = window.getSelection(); if (!selection?.isCollapsed || !selection.anchorNode) return;
      const backward = event.key === "Backspace"; const anchor = selection.anchorNode;
      let adjacent: Node | null = null;
      if (anchor.nodeType === Node.TEXT_NODE) {
        if (backward && selection.anchorOffset === 0) adjacent = anchor.previousSibling;
        if (!backward && selection.anchorOffset === (anchor.textContent?.length ?? 0)) adjacent = anchor.nextSibling;
      } else adjacent = anchor.childNodes[selection.anchorOffset - (backward ? 1 : 0)] ?? null;
      while (adjacent?.nodeType === Node.TEXT_NODE && !adjacent.textContent) adjacent = backward ? adjacent.previousSibling : adjacent.nextSibling;
      if (adjacent instanceof HTMLElement && adjacent.dataset.referenceToken) { event.preventDefault(); adjacent.remove(); commit(); }
    }} />;
}
