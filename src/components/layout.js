// src/components/Layout.js
import React from "react";
import { GlobalStyles } from "twin.macro";

const Layout = ({ children }) => (
  <div tw="relative min-h-screen bg-white">
    <div tw="absolute inset-0 bg-hero-flipped-diamonds opacity-[0.015] z-0" />
    <GlobalStyles />
    <div tw="relative max-w-5xl m-auto py-4 px-4 md:px-14 lg:px-20 z-10">
      {children}
    </div>
  </div>
);

export default Layout;
