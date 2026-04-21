import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-[transform,background-color,color,border-color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(65,87,121,0.4)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--line)] bg-[rgba(39,51,67,0.94)] text-white shadow-[0_16px_30px_rgba(39,51,67,0.18)] hover:-translate-y-px hover:bg-[rgba(39,51,67,0.86)]",
        destructive:
          "border border-[rgba(166,63,52,0.22)] bg-[rgba(166,63,52,0.92)] text-white hover:-translate-y-px hover:bg-[rgba(166,63,52,0.84)]",
        outline:
          "border border-[var(--line)] bg-[rgba(255,255,255,0.72)] text-[var(--ink)] hover:-translate-y-px hover:bg-[rgba(255,255,255,0.9)]",
        secondary:
          "border border-[rgba(68,83,101,0.08)] bg-[rgba(255,252,248,0.86)] text-[var(--ink)] hover:-translate-y-px hover:bg-[rgba(255,255,255,0.95)]",
        ghost: "text-[var(--ink)] hover:bg-[rgba(255,255,255,0.6)]",
        link: "text-[var(--ink)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
