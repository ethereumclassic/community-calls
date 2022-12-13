import { Link } from "gatsby";
import { GatsbyImage, getImage } from "gatsby-plugin-image";
import React from "react";
import tw from "twin.macro";
import ALink from "./aLink";

import DateTime from "./dateTime";
import GeneratedBanner from "./generatedBanner";

const ExistingImageBanner = ({ episode, thumb }) => {
  return (
    <div css={[tw`bg-slate-100`, thumb && tw`hover:bg-slate-200`]}>
      <GatsbyImage image={getImage(episode.frontmatter.image)} tw="-m-0.5" />
      <div
        css={[
          tw`flex text-slate-700 p-3`,
          thumb && tw`flex-col text-sm text-center hover:text-slate-800`,
        ]}
      >
        <div tw="flex-auto">
          <div tw="font-bold">{episode.frontmatter.name}</div>
          {!thumb && (
            <div>
              <ALink href={episode.frontmatter.link}>
                {episode.frontmatter.location}
              </ALink>
            </div>
          )}
        </div>
        <div css={[!thumb && tw`text-right`]}>
          <DateTime
            {...episode.frontmatter}
            short={thumb}
            css={[!thumb && tw`font-bold`]}
          />
          {!thumb && <DateTime {...episode.frontmatter} local={true} />}
        </div>
      </div>
    </div>
  );
};

const EpisodeBanner = ({ episode, thumb }) => {
  return (
    <div tw="overflow-hidden">
      {episode.frontmatter.image ? (
        <ExistingImageBanner {...{ episode, thumb }} />
      ) : (
        <GeneratedBanner {...{ episode, thumb }} />
      )}
    </div>
  );
};

export default EpisodeBanner;
