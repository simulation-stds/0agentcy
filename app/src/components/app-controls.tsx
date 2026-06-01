import type { ComponentProps, ReactNode } from "react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const fpsOptions = ["Auto from source", "12", "15", "20", "24", "25", "30", "48", "50", "60", "90", "120"];

export type StatusTone = "installed" | "update" | "missing" | "suggested" | "local";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ButtonProps = ComponentProps<typeof Button>;

export function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="help-icon material-symbols-rounded" aria-label={text} tabIndex={0}>
          help
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px]">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function HelpIcon({ text }: { text: string }) {
  return <InfoTooltip text={text} />;
}

export function FieldLabel({ children, help }: { children: ReactNode; help: string }) {
  return (
    <span className="setting-label">
      {children}
      <InfoTooltip text={help} />
    </span>
  );
}

export function FormRow({
  label,
  help,
  children,
}: {
  label: ReactNode;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="form-row">
      {help ? <FieldLabel help={help}>{label}</FieldLabel> : <span className="setting-label">{label}</span>}
      {children}
    </label>
  );
}

export function PrimaryButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("primary", className)} {...props} />;
}

export function SecondaryButton({ className, ...props }: ButtonProps) {
  return <Button variant="outline" className={className} {...props} />;
}

export function PathButton({ className, ...props }: ButtonProps) {
  return <Button variant="outline" className={cn("path-button", className)} {...props} />;
}

export function IconButton({ className, ...props }: ButtonProps) {
  return <Button variant="outline" size="icon" className={cn("icon-button", className)} {...props} />;
}

export function SwitchRow({
  checked,
  onCheckedChange,
  children,
  help,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
  help?: string;
}) {
  return (
    <label className="switch-row">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      {help ? <FieldLabel help={help}>{children}</FieldLabel> : <span>{children}</span>}
    </label>
  );
}

export function RangeControl({
  label,
  help,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  help: string;
  value: string | number;
  min: string | number;
  max: string | number;
  step: string | number;
  displayValue?: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <label className="range-control">
      <FieldLabel help={help}>
        {label}
        {displayValue !== undefined && <span>{displayValue}</span>}
      </FieldLabel>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

export function ColorControl({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-control">
      <FieldLabel help={help}>{label}</FieldLabel>
      <div className="color-row">
        <input type="color" value={value} onChange={(event) => onChange(event.currentTarget.value)} aria-label={`${label} color`} />
        <Input value={value} onChange={(event) => onChange(event.currentTarget.value)} />
      </div>
    </label>
  );
}

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <Badge className={`status-chip ${tone}`}>{children}</Badge>;
}

export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <div className="must-have-group">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function ToolAccordionItem({
  value,
  title,
  badge,
  summary,
  hasModels = false,
  children,
}: {
  value: string;
  title: ReactNode;
  badge?: ReactNode;
  summary: ReactNode;
  hasModels?: boolean;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value} className="tool-dropdown">
      <AccordionTrigger className={`tool-dropdown-head ${hasModels ? "has-models" : "no-models"}`}>
        <strong className="tool-dropdown-head-title">
          {title}
          {badge}
        </strong>
        <span>{summary}</span>
      </AccordionTrigger>
      <AccordionContent className="tool-dropdown-body">{children}</AccordionContent>
    </AccordionItem>
  );
}

export function SelectControl({
  value,
  onChange,
  options,
  placeholder = "Select",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const emptyValue = "__empty__";
  const normalizedValue = value === "" ? emptyValue : value;

  return (
    <Select value={normalizedValue} onValueChange={(nextValue) => onChange(nextValue === emptyValue ? "" : nextValue)} disabled={disabled}>
      <SelectTrigger className="sidebar-select-trigger">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="sidebar-select-content" position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false}>
        {options.map((option) => (
          <SelectItem key={`${option.value}-${option.label}`} value={option.value === "" ? emptyValue : option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FpsSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <SelectControl
      value={value}
      onChange={onChange}
      options={fpsOptions.map((fps) => ({ value: fps === "Auto from source" ? "auto" : fps, label: fps === "Auto from source" ? fps : `${fps} fps` }))}
    />
  );
}
