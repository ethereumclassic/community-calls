import * as React from "react";
import { graphql, Link } from "gatsby";
import { Helmet } from "react-helmet";
import "twin.macro";

import Layout from "../components/layout";
import EpisodeCell from "../components/episodeCell";

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
      <div tw="grid grid-cols-5 gap-2">
        {data.episodes.nodes.map((episode) => (
          <EpisodeCell id={episode.id} episode={episode} />
        ))}
      </div>
    </Layout>
  );
};

export default IndexPage;

export const pageQuery = graphql`
  fragment EpisodeSummary on MarkdownRemark {
    id
    fields {
      slug
      episode
    }
    frontmatter {
      date(formatString: "YYYY.MM.DD")
      time
      location
      name
    }
    frontmatter {
      image {
        childImageSharp {
          gatsbyImageData(
            placeholder: BLURRED
            width: 256
            aspectRatio: 1.78
            transformOptions: { cropFocus: CENTER }
          )
        }
      }
    }
  }
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
        ...EpisodeSummary
      }
    }
  }
`;
