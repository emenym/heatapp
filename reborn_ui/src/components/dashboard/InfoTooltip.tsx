import { useId, useState, type ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";

type InfoTooltipProps = {
  label: string;
  children: ReactNode;
};

export function InfoTooltip({ label, children }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <Tooltip.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Trigger
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        closeOnClick={false}
        onClick={() => setOpen(true)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-400/50 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
      >
        i
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={8} className="z-[100]">
          <Tooltip.Popup id={tooltipId} role="tooltip" className="max-h-[min(70vh,var(--available-height))] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-slate-400/30 bg-slate-950 p-3 text-xs text-slate-200 shadow-lg">
            {children}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
