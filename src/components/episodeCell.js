import { Link } from "gatsby";
import { GatsbyImage, getImage } from "gatsby-plugin-image";
import React from "react";
import "twin.macro";

const Thumbnail = ({ episode }) => {
  const image = getImage(episode.frontmatter.image);
  return (
    <div tw="w-full">
      {image ? (
        <GatsbyImage image={image} tw="w-full" />
      ) : (
        <div tw="bg-green-100 h-32 w-full">hello there</div>
      )}
    </div>
  );
};

const EpisodeCell = ({ episode }) => {
  const { fields, frontmatter } = episode;
  return (
    <Link to={fields.slug}>
      <Thumbnail episode={episode} />
      {frontmatter.name}
    </Link>
  );
};

export default EpisodeCell;
