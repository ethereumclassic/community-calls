import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import React from "react";
import "twin.macro";

const ALink = ({ href, children, props }) => {
  if (!href) {
    return children;
  }
  return (
    <a
      href={href}
      target="_blank"
      tw="cursor-pointer underline hover:no-underline"
      {...props}
    >
      {children}
      <ArrowTopRightOnSquareIcon tw="w-3 inline ml-1" />
    </a>
  );
};

export default ALink;
