import { Link } from "gatsby";
import React from "react";
import "twin.macro";

const PrevNext = ({ episode, prev, next }) => {
  if (!episode.fields.episode) {
    return null;
  }
  return (
    <div tw="flex">
      {prev && (
        <div>
          <Link to={prev.fields.slug}>Episode {prev.fields.episode}</Link>
        </div>
      )}
      {next && (
        <div tw="text-right flex-auto">
          <Link to={next.fields.slug}>Episode {next.fields.episode}</Link>
        </div>
      )}
    </div>
  );
};

export default PrevNext;
