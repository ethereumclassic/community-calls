import * as React from "react";
import { graphql, Link } from "gatsby";
import { Helmet } from "react-helmet";
import "twin.macro";

import Layout from "../components/layout";
import PrevNext from "../components/prevNext";
import EpisodeBanner from "../components/episodeBanner";
import Disclaimer from "../components/disclaimer";

const Card = ({ children, ...props }) => {
  return (
    <div tw="overflow-hidden rounded-2xl shadow-lg mb-14" {...props}>
      {children}
    </div>
  );
};

const EpisodePage = ({ data }) => {
  const { episode, prev, next, site } = data;
  return (
    <Layout>
      <Helmet title={episode.frontmatter.name} />
      <div tw="text-center">
        <Link to="/">{site.meta.title}</Link>
      </div>
      <PrevNext {...{ episode, prev, next }} />
      <main>
        <Card>
          <EpisodeBanner episode={episode} />
        </Card>
        <Card>
          <Disclaimer />
        </Card>
        <Card tw="bg-white py-10 px-5 md:px-20">
          <article
            tw="prose max-w-none prose-slate"
            dangerouslySetInnerHTML={{ __html: episode.html }}
          />
        </Card>
      </main>
    </Layout>
  );
};

export default EpisodePage;

// TODO prev next

export const pageQuery = graphql`
  fragment EpisodeMeta on MarkdownRemark {
    fields {
      slug
      episode
    }
    frontmatter {
      name
      guests
      description
      date(formatString: "YYYY-MM-DD")
      time
      location
      link
      tagline
      host
      cohost
      recording {
        name
        link
      }
      offlineChat {
        time
        location
        link
      }
      images {
        childImageSharp {
          id
          gatsbyImageData(
            aspectRatio: 1
            transformOptions: { trim: 5 }
            width: 256
          )
        }
      }
    }
  }

  query ($id: String!, $prev: Int, $next: Int) {
    site {
      meta: siteMetadata {
        title
      }
    }
    episode: markdownRemark(id: { eq: $id }) {
      html
      frontmatter {
        image {
          childImageSharp {
            gatsbyImageData(width: 900, transformOptions: { cropFocus: CENTER })
          }
        }
      }
      ...EpisodeMeta
    }
    prev: markdownRemark(fields: { episode: { eq: $prev } }) {
      ...EpisodeMeta
    }
    next: markdownRemark(fields: { episode: { eq: $next } }) {
      ...EpisodeMeta
    }
  }
`;
