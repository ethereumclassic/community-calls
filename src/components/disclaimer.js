import React from "react";
import "twin.macro";
import { graphql, useStaticQuery } from "gatsby";

const Disclaimer = () => {
  const { site } = useStaticQuery(graphql`
    query {
      site {
        meta: siteMetadata {
          disclaimer
        }
      }
    }
  `);
  return (
    <div tw="bg-amber-100 rounded-xl p-5 text-amber-900 my-10 shadow-md">
      <b>Disclaimer:</b> {site.meta.disclaimer}
    </div>
  );
};

export default Disclaimer;
