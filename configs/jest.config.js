const path = require("path");

module.exports = {
  rootDir: path.resolve(__dirname, ".."), // ✅ project root

  testEnvironment: "node",
  verbose: true,
  clearMocks: true,

  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.js"],

  collectCoverage: true,
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text", "lcov"],

  testPathIgnorePatterns: ["/node_modules/", "/src/public/"],
};
