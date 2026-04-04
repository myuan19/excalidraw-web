import React, { forwardRef } from "react";
import clsx from "clsx";

import "./Stack.scss";

type StackProps = {
  children: React.ReactNode;
  gap?: number;
  align?: "start" | "center" | "end" | "baseline";
  justifyContent?: "center" | "space-around" | "space-between";
  className?: string | boolean;
  style?: React.CSSProperties;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragOverCapture?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
};

const RowStack = forwardRef(
  (
    {
      children,
      gap,
      align,
      justifyContent,
      className,
      style,
      onDragOver,
      onDragOverCapture,
      onDrop,
    }: StackProps,
    ref: React.ForwardedRef<HTMLDivElement>,
  ) => {
    return (
      <div
        className={clsx("Stack Stack_horizontal", className)}
        style={{
          "--gap": gap,
          alignItems: align,
          justifyContent,
          ...style,
        }}
        ref={ref}
        onDragOver={onDragOver}
        onDragOverCapture={onDragOverCapture}
        onDrop={onDrop}
      >
        {children}
      </div>
    );
  },
);

const ColStack = forwardRef(
  (
    {
      children,
      gap,
      align,
      justifyContent,
      className,
      style,
      onDragOver,
      onDragOverCapture,
      onDrop,
    }: StackProps,
    ref: React.ForwardedRef<HTMLDivElement>,
  ) => {
    return (
      <div
        className={clsx("Stack Stack_vertical", className)}
        style={{
          "--gap": gap,
          justifyItems: align,
          justifyContent,
          ...style,
        }}
        ref={ref}
        onDragOver={onDragOver}
        onDragOverCapture={onDragOverCapture}
        onDrop={onDrop}
      >
        {children}
      </div>
    );
  },
);

export default {
  Row: RowStack,
  Col: ColStack,
};
