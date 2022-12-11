module.exports = {
  theme: {
    extend: {
      colors: {},
    },
  },
  plugins: [
    require("@tailwindcss/line-clamp"),
    require("@tailwindcss/typography"),
    require("tailwind-heropatterns")({
      colors: {
        default: "#000",
        white: "#fff",
      },
      opacity: {
        default: "1",
      },
    }),
  ],
};
