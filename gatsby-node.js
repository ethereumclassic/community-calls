const path = require(`path`);
const { createFilePath } = require(`gatsby-source-filesystem`);

exports.onCreateNode = ({ node, actions, getNode }) => {
  const { createNodeField } = actions;

  if (node.internal.type === `MarkdownRemark`) {
    const filePath = createFilePath({ node, getNode });

    // if a date is set, it is an episode

    // TODO special page template for readme
    let slug = filePath;
    if (filePath === "/README/") {
      slug = "/";
    } else if (filePath.includes("_")) {
      const parsedNumber = parseInt(filePath.split("_").pop(), 10);
      if (parsedNumber > 0) {
        slug = `/${parsedNumber}/`;
        createNodeField({
          node,
          name: `episode`,
          value: parsedNumber,
        });
      }
    }
    createNodeField({
      node,
      name: `slug`,
      value: slug,
    });
  }
};

exports.createPages = async ({ graphql, actions, reporter }) => {
  const { createPage } = actions;

  // Get all markdown posts sorted by date
  const result = await graphql(
    `
      {
        allMarkdownRemark(sort: { frontmatter: { date: DESC } }) {
          nodes {
            id
            fields {
              slug
              episode
            }
            frontmatter {
              date
            }
            fields {
              episode
            }
          }
        }
      }
    `
  );

  const posts = result.data.allMarkdownRemark.nodes;

  const templates = {
    index: path.resolve(`./src/templates/index.js`),
    episode: path.resolve(`./src/templates/episode.js`),
  };

  // TODO handle this better without episode numbers, using prev/next

  if (posts.length > 0) {
    posts.forEach((post, i) => {
      const isEvent = !!post.frontmatter.date;
      const { episode } = post.fields;
      const postTemplate = templates[isEvent ? "episode" : "index"];
      const page = {
        path: post.fields.slug,
        component: postTemplate,
        context: {
          id: post.id,
          ...(episode && {
            prev: episode - 1,
            next: episode + 1,
          }),
        },
      };
      createPage(page);
    });
  }
};
