import * as React from "react";
import { graphql, Link } from "gatsby";
import { Helmet } from "react-helmet";
import "twin.macro";

import Layout from "../components/layout";
import EpisodeBanner from "../components/episodeBanner";

const IndexPage = ({ data }) => {
  console.log("data", data);
  return (
    <Layout>
      <Helmet title={data.site.siteMetadata.title} />
      <main>
        <article
          tw="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: data.md.html }}
        />
      </main>
      <div tw="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {data.episodes.nodes.map((episode) => (
          <Link
            id={episode.id}
            to={episode.fields.slug}
            tw="rounded-lg overflow-hidden shadow-md"
          >
            <EpisodeBanner {...{ episode, thumb: true }} />
          </Link>
        ))}
      </div>
    </Layout>
  );
};

export default IndexPage;

export const pageQuery = graphql`
  query ($id: String!) {
    site {
      siteMetadata {
        title
      }
    }
    md: markdownRemark(id: { eq: $id }) {
      id
      html
    }
    episodes: allMarkdownRemark(
      sort: { frontmatter: { date: DESC } }
      filter: { frontmatter: { date: { ne: null } } }
    ) {
      nodes {
        frontmatter {
          image {
            childImageSharp {
              gatsbyImageData(
                width: 256
                aspectRatio: 1.78
                transformOptions: { cropFocus: CENTER }
              )
            }
          }
        }
        ...EpisodeMeta
      }
    }
  }
`;
