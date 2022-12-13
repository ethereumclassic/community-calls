import React from "react";
import tw from "twin.macro";
import { graphql, Link, useStaticQuery } from "gatsby";
import { GatsbyImage, getImage, StaticImage } from "gatsby-plugin-image";
import {
  CalendarDaysIcon,
  ChatBubbleBottomCenterTextIcon,
  HashtagIcon,
  MicrophoneIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import DateTime from "./dateTime";
import ALink from "./aLink";
import GeneratedBackground from "./generatedBackground";

const MetaItem = ({ Icon, text, name, ...props }) => (
  <div tw="flex items-center space-x-6" {...props}>
    <div>
      <Icon tw="w-6 md:w-10 flex-auto" />
    </div>
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
  return (
    <GeneratedBackground episode={episode}>
      <div css={[tw`relative z-10 min-h-full p-8 md:p-10 flex`]}>
        {/* left */}
        <div tw="flex flex-col flex-auto md:text-lg">
          {/* left top */}
          <div tw="flex">
            <div tw="flex items-center space-x-5">
              <div>
                <StaticImage
                  src="../images/etc_logo_white.png"
                  layout="fixed"
                  placeholder="none"
                  height={60}
                />
              </div>
              <div>
                <div tw="text-xl md:text-2xl lg:text-3xl font-bold">
                  {site.meta.title}
                </div>
                {frontmatter.tagline && (
                  <div tw="text-sm md:text-lg">{frontmatter.tagline}</div>
                )}
              </div>
            </div>
            {/* <div tw="flex flex-col text-right md:hidden">
              <div tw="text-5xl font-black">#{fields.episode}</div>
              <div tw="h-full">
                {images &&
                  images.map(({ childImageSharp: image }, i) => (
                    <GatsbyImage
                      image={getImage(image)}
                      layout="fixed"
                      placeholder="none"
                      tw="rounded-full w-16"
                    />
                  ))}
              </div>
            </div> */}
          </div>

          {/* left middle */}
          <div tw="flex flex-auto items-center py-6">
            <div tw="space-y-4 leading-5">
              <MetaItem
                Icon={CalendarDaysIcon}
                text={
                  <>
                    <div tw="text-xl md:text-2xl">
                      <DateTime {...frontmatter} />
                    </div>
                    {<DateTime {...frontmatter} local={true} />}
                  </>
                }
              />
              <MetaItem
                tw="md:hidden"
                Icon={HashtagIcon}
                text={`Episode ${fields.episode}`}
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
              {frontmatter.guests && (
                <MetaItem
                  Icon={UsersIcon}
                  name={frontmatter.guests.includes(", ") ? "Guests" : "Guest"}
                  text={frontmatter.guests}
                />
              )}
              {frontmatter.description && (
                <MetaItem
                  Icon={ChatBubbleBottomCenterTextIcon}
                  name="Agenda"
                  text={frontmatter.description}
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
                  tw="inline"
                  timeOnly
                />{" "}
                <ALink href={frontmatter.offlineChat.link}>
                  {frontmatter.offlineChat.location}
                </ALink>
              </div>
            )}
          </div>
        </div>
        <div tw="flex-col hidden md:flex pl-5">
          {/* right */}
          <div
            css={[
              tw`flex-auto text-right flex-col w-24 lg:w-48 ml-5`,
              images.length === 2 && tw`w-16 lg:w-32 ml-20`,
              images.length > 2 && tw`w-20 lg:w-44`,
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
                    id={image.id}
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
    </GeneratedBackground>
  );
};

export default GeneratedBanner;
