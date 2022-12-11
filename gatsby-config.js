module.exports = {
  siteMetadata: {
    title: "Ethereum Classic Community Calls",
    disclaimer:
      "There is no official anything in Ethereum Classic, including these calls. Projects, assets or other third party offerings discussed should not be considered endorsements. Always do your own research.",
  },
  plugins: [
    // "gatsby-plugin-sass",
    { resolve: `gatsby-plugin-emotion` },
    "gatsby-plugin-image",
    "gatsby-plugin-react-helmet",
    {
      resolve: `gatsby-transformer-remark`,
      options: {
        plugins: [
          {
            resolve: `gatsby-remark-images`,
            options: {
              maxWidth: 600,
              linkImagesToOriginal: false,
            },
          },
          {
            resolve: `gatsby-remark-table-of-contents`,
            options: {
              tight: true,
              fromHeading: 2,
              toHeading: 3,
              className: "table-of-contents",
            },
          },
          `gatsby-remark-autolink-headers`,
        ],
      },
    },
    "gatsby-plugin-sharp",
    "gatsby-transformer-sharp",
    {
      resolve: "gatsby-source-filesystem",
      options: {
        name: "images",
        path: "./img/",
      },
      __key: "images",
    },
    {
      resolve: "gatsby-source-filesystem",
      options: {
        name: "documents",
        path: "./",
        ignore: [
          `**/\.*`,
          "node_modules/**",
          `src/**`,
          `public/**`,
          `posts/**`,
          `img/**`,
        ],
      },
      __key: "documents",
    },
  ],
};
