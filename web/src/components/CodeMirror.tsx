import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { setDiagnostics, lintGutter, type Diagnostic } from '@codemirror/lint';
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  HighlightStyle,
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { closeBrackets } from '@codemirror/autocomplete';
import { cn } from '../lib/cn';

export interface CodeIssue {
  line?: number;
  message: string;
}

// Warm Clay syntax theme, wired to CSS variables so it follows light/dark.
const warmTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'rgb(var(--ink))', fontSize: '13px' },
  '.cm-content': { fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace', padding: '10px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'rgb(var(--ink-subtle))' },
  '.cm-activeLine': { backgroundColor: 'rgb(var(--clay) / 0.05)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'rgb(var(--clay))' },
  '.cm-cursor': { borderLeftColor: 'rgb(var(--clay))' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgb(var(--clay) / 0.18)',
  },
  '.cm-lintRange-error': { textDecoration: 'underline wavy rgb(var(--danger))' },
  '.cm-scroller': { lineHeight: '1.6' },
});

const warmHighlight = HighlightStyle.define([
  { tag: [t.string, t.special(t.string)], color: 'rgb(var(--success))' },
  { tag: [t.number, t.bool, t.null], color: 'rgb(var(--clay))' },
  { tag: [t.propertyName], color: 'rgb(var(--info))' },
  { tag: [t.keyword], color: 'rgb(var(--clay))' },
  { tag: [t.comment], color: 'rgb(var(--ink-subtle))', fontStyle: 'italic' },
  { tag: [t.heading], color: 'rgb(var(--clay))', fontWeight: 'bold' },
  { tag: [t.link, t.url], color: 'rgb(var(--info))', textDecoration: 'underline' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.strong], fontWeight: 'bold' },
]);

export function CodeMirror({
  value,
  language,
  onChange,
  readOnly = false,
  diagnostics = [],
  placeholder,
  className,
  minHeight = '200px',
  maxHeight,
}: {
  value: string;
  language: 'json' | 'markdown';
  onChange?: (value: string) => void;
  readOnly?: boolean;
  diagnostics?: CodeIssue[];
  placeholder?: string;
  className?: string;
  minHeight?: string;
  /** When set, the editor caps at this height and scrolls internally instead of growing. */
  maxHeight?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create the view once.
  useEffect(() => {
    const langCompartment = new Compartment();
    const editableCompartment = new Compartment();
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        lintGutter(),
        syntaxHighlighting(warmHighlight),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        warmTheme,
        maxHeight ? EditorView.theme({ '&': { maxHeight }, '.cm-scroller': { overflow: 'auto' } }) : [],
        EditorView.lineWrapping,
        langCompartment.of(language === 'json' ? json() : markdown()),
        editableCompartment.of(EditorView.editable.of(!readOnly)),
        placeholder ? cmPlaceholder(placeholder) : [],
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current! });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. raw<->form, reset).
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (value !== current) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // Apply external diagnostics.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const diags: Diagnostic[] = diagnostics.map((d) => {
      const lineNo = Math.min(Math.max(d.line ?? 1, 1), doc.lines);
      const line = doc.line(lineNo);
      return { from: line.from, to: line.to, severity: 'error', message: d.message };
    });
    v.dispatch(setDiagnostics(v.state, diags));
  }, [diagnostics]);

  return <div ref={host} className={cn('cm-host overflow-auto rounded-md border border-border bg-surface', className)} style={{ minHeight }} />;
}
