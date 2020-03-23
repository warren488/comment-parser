(async () => {
  const ParsedFile = require("./ParsedFile");
  const file = await new ParsedFile("./index.js");
  await file.init()
  console.log(file.generateHTML());
})();
