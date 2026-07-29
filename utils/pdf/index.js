/**
 * Server PDF utilities — fill, bulk values, after-vitals.
 */
module.exports = {
  ...require("./fillService"),
  ...require("./bulkFormValues"),
  ...require("./afterVitals")
};
