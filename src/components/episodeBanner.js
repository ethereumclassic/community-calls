import { Link } from "gatsby";
import { GatsbyImage, getImage } from "gatsby-plugin-image";
import React from "react";
import "twin.macro";

import DateTime from "./dateTime";
import GeneratedBanner from "./generatedBanner";

const ExistingImageBanner = ({ episode }) => {
  return (
    <div tw="bg-stone-900">
      <GatsbyImage image={getImage(episode.frontmatter.image)} tw="-m-0.5" />
      <div tw="flex text-white p-3">
        <div tw="flex-auto">{episode.frontmatter.name}</div>
        <div>
          <DateTime {...episode.frontmatter} local={false} />
        </div>
      </div>
    </div>
  );
};

const EpisodeBanner = ({ episode }) => {
  // if we have the image, return it at the right resolution
  return (
    <div tw="drop-shadow-xl rounded-2xl overflow-hidden">
      {episode.frontmatter.image ? (
        <ExistingImageBanner {...{ episode }} />
      ) : (
        <GeneratedBanner {...{ episode }} />
      )}
      {/* <pre>{JSON.stringify(episode, null, 2)}</pre> */}
    </div>
  );
};

export default EpisodeBanner;
