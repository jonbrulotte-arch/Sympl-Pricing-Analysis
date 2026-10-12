"use client";

import { useState, type ReactNode, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

interface Props extends Omit<ButtonProps, "onClick"> {
  href: string;
  children: ReactNode;
  loadingText?: string;
}

export function NavigatingButton({ href, children, loadingText = "Loading...", ...buttonProps }: Props) {
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    if (navigating) return;
    setNavigating(true);
    router.push(href);
  }

  return (
    <Button {...buttonProps} onClick={handleClick} disabled={navigating}>
      {navigating ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
