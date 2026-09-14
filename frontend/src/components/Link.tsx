import type { AnchorHTMLAttributes, MouseEvent } from "react";

import { navigate } from "../lib/router";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** Client-side navigation link that still behaves like a normal <a>. */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
