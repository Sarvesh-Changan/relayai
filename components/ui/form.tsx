"use client";

import * as React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const Form = FormProvider;
const FormField = <TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>(
  props: ControllerProps<TFieldValues, TName>,
) => <Controller {...props} />;

const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("grid gap-2", className)} {...props} />
));
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<React.ElementRef<typeof Label>, React.ComponentPropsWithoutRef<typeof Label>>((props, ref) => (
  <Label ref={ref} {...props} />
));
FormLabel.displayName = "FormLabel";

function FormMessage({ children }: { children?: React.ReactNode }) {
  const { formState } = useFormContext();
  return <p className="text-destructive text-sm">{children ?? Object.values(formState.errors)[0]?.message?.toString()}</p>;
}

export { Form, FormField, FormItem, FormLabel, FormMessage };
