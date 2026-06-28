const pkg = require("./package.json");

module.exports = {
  ...pkg.build,
  productName: "EditorHub Debug",
};
