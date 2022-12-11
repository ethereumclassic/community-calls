import * as React from "react";
import { graphql, Link } from "gatsby";
import { Helmet } from "react-helmet";
import "twin.macro";

import Layout from "../components/layout";
import PrevNext from "../components/prevNext";
import EpisodeBanner from "../components/episodeBanner";
import Disclaimer from "../components/disclaimer";

const IndexPage = ({ data }) => {
  const { episode, prev, next, site } = data;
  return (
    <Layout>
      <Helmet title={episode.frontmatter.name} />
      <div tw="text-center">
        <Link to="/">{site.meta.title}</Link>
      </div>
      <PrevNext {...{ episode, prev, next }} />
      <main>
        <EpisodeBanner episode={episode} />
        <Disclaimer />
        <div tw="bg-slate-50 m-auto py-10 sm:px-5 md:px-20 rounded-2xl shadow-lg mb-20">
          <div tw="text-slate-300 text-2xl font-bold">Notes</div>
          <article
            tw="prose max-w-none prose-slate"
            dangerouslySetInnerHTML={{ __html: episode.html }}
          />
        </div>
      </main>
    </Layout>
  );
};

export default IndexPage;

// TODO prev next

export const pageQuery = graphql`
  query ($id: String!, $prev: Int, $next: Int) {
    site {
      meta: siteMetadata {
        title
      }
    }
    episode: markdownRemark(id: { eq: $id }) {
      html
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
        tagline
        link
        recording {
          name
          link
        }
        host
        cohost
        image {
          childImageSharp {
            gatsbyImageData(width: 900, transformOptions: { cropFocus: CENTER })
          }
        }
        images {
          childImageSharp {
            gatsbyImageData(
              aspectRatio: 1
              transformOptions: { trim: 5 }
              width: 256
            )
            id
          }
        }
        offlineChat {
          time
          location
          link
        }
      }
    }
    prev: markdownRemark(fields: { episode: { eq: $prev } }) {
      ...EpisodeSummary
    }
    next: markdownRemark(fields: { episode: { eq: $next } }) {
      ...EpisodeSummary
    }
  }
`;
