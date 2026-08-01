import type { ComponentProps, ReactNode } from "react";

/** Small shared primitives. The app is mostly lists, cards and steppers. */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-raised ${className}`}>
      {children}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium">
      {children}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-xl border border-line bg-raised px-4 py-3 text-base outline-none focus:border-accent ${className}`}
    />
  );
}

export function Textarea(props: ComponentProps<"textarea">) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`w-full rounded-xl border border-line bg-raised px-4 py-3 text-base leading-relaxed outline-none focus:border-accent ${className}`}
    />
  );
}

export function Select(props: ComponentProps<"select">) {
  const { className = "", children, ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full appearance-none rounded-xl border border-line bg-raised px-4 py-3 text-base outline-none focus:border-accent ${className}`}
    >
      {children}
    </select>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "quiet" }) {
  const styles = {
    primary: "bg-accent text-on-accent",
    secondary: "border border-line bg-raised text-foreground",
    quiet: "text-muted",
  }[variant];

  return (
    <button
      {...rest}
      className={`min-h-11 rounded-xl px-4 py-3 text-base font-medium disabled:opacity-60 ${styles} ${className}`}
    />
  );
}

/** Checkbox with a generous tap target — this gets used with wet hands. */
export function CheckboxRow({
  name,
  label,
  hint,
  defaultChecked,
  value,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  value?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 px-4 py-3">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
      />
      <span className="text-base leading-6">
        {label}
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger" | "success";
}) {
  const styles = {
    neutral: "border-line text-muted",
    accent: "border-accent text-accent",
    danger: "border-danger text-danger",
    success: "border-success text-success",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <Card className="p-6 text-center">
      <p className="font-medium">{title}</p>
      {children && (
        <div className="mt-1 text-sm leading-relaxed text-muted">{children}</div>
      )}
    </Card>
  );
}
