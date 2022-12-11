import React from "react";
import tw from "twin.macro";
import { graphql, Link, useStaticQuery } from "gatsby";
import { GatsbyImage, getImage, StaticImage } from "gatsby-plugin-image";
import {
  CalendarDaysIcon,
  ChatBubbleBottomCenterTextIcon,
  MicrophoneIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import DateTime from "./dateTime";
import ALink from "./aLink";

const MetaItem = ({ Icon, text, name, ...props }) => (
  <div tw="flex items-center space-x-6" {...props}>
    <Icon tw="w-10" />
    <div tw="flex items-center space-x-4">
      {name && <div tw="font-bold">{name}</div>}
      <div>{text}</div>
    </div>
  </div>
);

const GeneratedBanner = ({ episode }) => {
  const { site } = useStaticQuery(graphql`
    query {
      site {
        meta: siteMetadata {
          title
        }
      }
    }
  `);
  const { frontmatter, fields } = episode;
  const images =
    frontmatter.images?.length > 0 && frontmatter.images.slice(0, 6);
  // TODO automatically colorize the episodes randomly
  return (
    <div tw="aspect-video w-full bg-black bg-gradient-to-tl from-green-400 to-green-100/20 overflow-hidden relative shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]">
      <div tw="absolute inset-0 bg-hero-connections opacity-5"></div>
      <div tw="absolute inset-10 text-white flex text-lg">
        <div tw="flex flex-col flex-auto">
          {/* left */}
          <div tw="flex items-center space-x-5">
            {/* left top */}
            <div>
              <StaticImage
                src="../images/etc_logo_white.png"
                layout="fixed"
                placeholder="none"
                height={60}
              />
            </div>
            <div>
              <div tw="text-3xl font-bold">{site.meta.title}</div>
              {frontmatter.tagline && <div>{frontmatter.tagline}</div>}
            </div>
          </div>
          <div tw="flex flex-auto items-center">
            {/* left middle */}
            <div tw="space-y-4 leading-5">
              <MetaItem
                Icon={CalendarDaysIcon}
                text={
                  <>
                    <div tw="text-2xl">
                      <DateTime {...frontmatter} />
                    </div>
                    <DateTime {...frontmatter} local={true} />
                  </>
                }
              />
              <MetaItem
                Icon={MicrophoneIcon}
                text={
                  <div tw="flex items-center space-x-4">
                    <div>
                      <ALink href={frontmatter.link}>
                        {frontmatter.location}
                      </ALink>
                    </div>
                    {frontmatter.recording && (
                      <div>
                        <ALink href={frontmatter.recording.link}>
                          {frontmatter.recording.name}
                        </ALink>
                      </div>
                    )}
                  </div>
                }
              />
              {frontmatter.description && (
                <MetaItem
                  Icon={ChatBubbleBottomCenterTextIcon}
                  name="Agenda"
                  text={frontmatter.description}
                />
              )}
              {frontmatter.guests && (
                <MetaItem
                  Icon={UsersIcon}
                  name={frontmatter.guests.includes(", ") ? "Guests" : "Guest"}
                  text={frontmatter.guests}
                />
              )}
            </div>
          </div>
          {/* left bottom */}
          <div tw="text-sm">
            {frontmatter.offlineChat && (
              <div>
                {"Non-broadcast chat @ "}
                <DateTime
                  date={frontmatter.date}
                  time={frontmatter.offlineChat.time}
                  timeOnly
                />{" "}
                <ALink href={frontmatter.offlineChat.link}>
                  {frontmatter.offlineChat.location}
                </ALink>
              </div>
            )}
            {frontmatter.disclaimer && <div>{frontmatter.disclaimer}</div>}
          </div>
        </div>
        <div tw="flex flex-col">
          {/* right */}
          <div
            css={[
              tw`flex-auto text-right flex-col w-52 ml-5`,
              images.length === 2 && tw`w-32 ml-20`,
              images.length > 2 && tw`w-44`,
            ]}
          >
            {images && (
              <div
                css={[
                  tw`grid grid-cols-1`,
                  images.length > 2 && tw`grid-cols-4`,
                ]}
              >
                {images.map(({ childImageSharp: image }, i) => (
                  <div
                    css={[
                      tw`col-span-2`,
                      images.length > 2 &&
                        images.length % 2 === 1 &&
                        i + 1 === images.length &&
                        tw`col-start-2`,
                    ]}
                  >
                    <GatsbyImage
                      id={image.id}
                      image={getImage(image)}
                      layout="fixed"
                      placeholder="none"
                      tw="rounded-full -mt-5 -ml-5 -mr-5"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div tw="text-7xl font-black text-right">#{fields.episode}</div>
        </div>
      </div>
    </div>
  );
};

export default GeneratedBanner;
