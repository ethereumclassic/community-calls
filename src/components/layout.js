// src/components/Layout.js
import React from "react";
import { GlobalStyles } from "twin.macro";

const Layout = ({ children }) => (
  <div tw="mx-auto px-4 max-w-4xl">
    <GlobalStyles />
    {children}
  </div>
);

export default Layout;
