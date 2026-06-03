import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { Check, Copy, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn';

// --- Button ---

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-clay text-white shadow-sm hover:bg-clay-hover active:bg-clay-active',
  secondary: 'bg-surface border border-border text-ink hover:bg-surface-2 hover:border-border-strong',
  ghost: 'text-ink-muted hover:bg-clay-soft hover:text-clay',
  danger: 'text-danger border border-danger/30 hover:bg-danger-soft',
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm rounded-sm gap-1.5',
  md: 'h-9 px-3.5 text-base rounded-md gap-2',
  lg: 'h-10 px-4 text-base rounded-md gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition-colors duration-150 focus-ring disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, children, ...props },
  ref,
) {
  return (
    <Tooltip content={label}>
      <button
        ref={ref}
        aria-label={label}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-clay-soft hover:text-clay focus-ring',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
});

// --- Inputs ---

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; invalid?: boolean }>(
  function Input({ className, mono, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-sm border bg-surface px-3 text-base text-ink transition-colors placeholder:text-ink-subtle focus:outline-none',
          mono && 'font-mono text-sm',
          invalid
            ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/30'
            : 'border-border focus:border-clay focus:ring-2 focus:ring-clay-ring/40',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }>(
  function Textarea({ className, mono, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-sm border border-border bg-surface px-3 py-2 text-base text-ink transition-colors placeholder:text-ink-subtle focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay-ring/40',
          mono && 'font-mono text-sm',
          className,
        )}
        {...props}
      />
    );
  },
);

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {hint && !error && <p className="text-xs text-ink-subtle">{hint}</p>}
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// --- Card / Badge / Chip ---

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-md border border-border bg-surface', className)} {...props}>
      {children}
    </div>
  );
}

type BadgeTone = 'neutral' | 'clay' | 'success' | 'warning' | 'danger' | 'info';
const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-bg-subtle text-ink-muted border-border',
  clay: 'bg-clay-soft text-clay border-clay/20',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
  info: 'bg-info/10 text-info border-info/20',
};
export function Badge({ tone = 'neutral', className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// --- Switch / Segmented ---

export function Switch({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative h-5 w-9 shrink-0 rounded-full border border-border bg-bg-subtle transition-colors data-[state=checked]:border-clay data-[state=checked]:bg-clay disabled:opacity-50 focus-ring"
    >
      <RadixSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
    </RadixSwitch.Root>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="inline-flex rounded-md bg-bg-subtle p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-[7px] px-2.5 py-1 text-sm font-medium transition-colors focus-ring',
            value === opt.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// --- Tooltip ---

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            sideOffset={6}
            className="z-50 animate-fade-in rounded-sm border border-border bg-surface px-2 py-1 text-xs text-ink shadow-md"
          >
            {content}
            <RadixTooltip.Arrow className="fill-surface" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

// --- Misc ---

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-ink-subtle', className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-bg-subtle px-1 font-mono text-[11px] text-ink-muted">
      {children}
    </kbd>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface/40 px-6 py-16 text-center">
      {icon && <div className="mb-3 text-ink-subtle">{icon}</div>}
      <h3 className="font-display text-lg text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={cn('inline-flex h-6 w-6 items-center justify-center rounded text-ink-subtle hover:bg-clay-soft hover:text-clay', className)}
      aria-label="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
