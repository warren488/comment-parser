const parse = require("comment-parser");
const fs = require("fs");
const showdown = require("showdown");
const Handlebars = require("handlebars");
const { promisify } = require("util");
const argv = require("yargs")
  .options({
    i: {
      alias: "include",
      demandOption: false,
      describe: "file extensions which we should parse",
      type: "array"
    },
    p: {
      alias: "path",
      demandOption: true,
      describe: "path to the file or folder to document",
      type: "string"
    }
  })
  .config("conf").argv;
let parseFile = promisify(parse.file);

async function doStuff2(path) {
  if (path.endsWith("html")) {
    return;
  }
  if (fs.lstatSync(path).isDirectory()) {
    let files = fs.readdirSync(path);
    let fileList = [];
    for (const file of files) {
      if (
        file.endsWith("html") ||
        file.endsWith("docs") ||
        file.includes("node_modules") ||
        file.startsWith(".git")
      ) {
        continue;
      }
      if (!fs.lstatSync(`${path}/` + file).isDirectory()) {
        fileList.push({ name: file, path: `${file}.doc.html` });
        await generateFile(`${path}/` + file);
      } else {
        fileList.push({ name: file, path: `../${file}/docs/` });
        doStuff2(`${path}/` + file);
      }
    } //forof files
    generateIndexHTML(fileList, path);
  } else {
    await generateFile(path);

    console.log("called on file doing nothing");
  }
}
doStuff2(argv.p);

function gethtmlForSnippet(md, lineStart, lang) {
  return `<code>
    <pre class="prettyprint lang-${lang} linenums:${lineStart + 1}">
${md}
    </pre>
  </code>`;
}

function getCSSAndLines(filePath) {
  let css = fs.readFileSync(filePath).toString("utf8");
  /**
   * @ref 1
   */
  let cssLines = css.split("\n").map(el => el.trim());
  let cssLinesUntrimmed = css.split("\n");

  return {
    css,
    cssLines,
    cssLinesUntrimmed
  };
}

/**
 * This function checks if comment is a one liner
 * @function isOneLine
 * */
function isOneLine(cssLines, line) {
  /** here we look to see if the comment has a closing tag on the same line as its opening tag
   * to deremine if its a one liner but what happens is that the description returned will have no new
   * line chars in it which is how we determine how long the comment is
   */
  return cssLines[line].includes("*/");
}

/**
 * trim the string all the way up until the end of the current comment
 * THIS WORKS ONLY FOR SINGLE LINE COMMENTS!!!
 * @function getCodeAfterComment
 * */
function getCodeAfterComment(cssLinesUntrimmed, comment) {
  return cssLinesUntrimmed
    .slice(comment.line + 1, comment.line + 11)
    .join("\n");
}

/**
 *  get the code after the comment but for multiline strings
 * @function getCodeAfterCommentForMultiLine
 * */
function getCodeAfterCommentForMultiLine(
  cssLines,
  parsedComment,
  cssLinesUntrimmed
) {
  /** get the last line of the comment */
  let endOfComment = getCommentEndLine(cssLines, parsedComment.line);
  // console.log(endOfComment);
  return cssLinesUntrimmed
    .slice(endOfComment + 1, endOfComment + 11)
    .join("\n");
}

function getCommentEndLine(cssLines, line) {
  /** one line comment */
  if (cssLines[line].includes("*/")) {
    return line;
  }
  /** search for the next line greater than the current line that has a closing tag */
  let index = cssLines.findIndex(
    (el, index) => index >= line && el.includes("*/")
  );
  return index;
}

async function generateFile(filePath) {
  let comments = [];
  let language = filePath.split(".").pop();
  /** get raw and semi transformed data */
  let { css, cssLines, cssLinesUntrimmed } = getCSSAndLines(filePath);
  /** extract comment data */
  await parseFile(filePath).then(async function(parsedComments) {
    if (parsedComments.length === 0) {
      return;
    }
    for (let i = 0; i < parsedComments.length; i++) {
      /** 
      if we have a one line comment we can do this
      it will not work tho with multiline (that have spacing before each line)
      because the comment.source goes through formatting 
      TODO: revisit after implementing bypass for having to trim css lines
      */
      if (parsedComments[i].tags.findIndex(el => el.tag === "ref") !== -1) {
        /** if we've made a reference to an external comment go ahead and insert that now */
        console.log("here", parsedComments[i].line);
        parsedComments = await insertRef(parsedComments, i);
      }
      if (isOneLine(cssLines, parsedComments[i].line)) {
        /** gets 10 lines after the comment */
        let md = getCodeAfterComment(cssLinesUntrimmed, parsedComments[i]);
        /** generate hmtl snippet and attach it to this comment */
        parsedComments[i].htmlSnippet = gethtmlForSnippet(
          md,
          parsedComments[i].line + 1,
          language
        );
      } else {
        let md = getCodeAfterCommentForMultiLine(
          cssLines,
          parsedComments[i],
          cssLinesUntrimmed
        );
        parsedComments[i].htmlSnippet = gethtmlForSnippet(
          md,
          getCommentEndLine(cssLines, parsedComments[i].line) + 1,
          language
        );
      }
    }
    comments.push(...parsedComments);
  });
  {
    let template = fs.readFileSync(`./template.hbs`).toString("utf8");
    let directory = filePath.split("/").slice(0, -1).join('/');
    let fileName = filePath.split("/").pop();
    if (!fs.existsSync(`${directory}/docs`)) {
      fs.mkdirSync(`${directory}/docs`);
    }
    fs.writeFileSync(
      `${directory}/docs/${fileName}.doc.html`,
      Handlebars.compile(template)({ comments })
    );
  }
}

/**
 *
 * @param {array} folderList array of folder to add to navigation on home page
 * @param {string} path path to the output folder
 */
function generateIndexHTML(folderList, path) {
  let template = fs.readFileSync(`./folderList.hbs`).toString("utf8");
  if (!fs.existsSync(`${path}/docs`)) {
    fs.mkdirSync(`${path}/docs`);
  }
  fs.writeFileSync(
    `${path}/docs/index.html`,
    Handlebars.compile(template)({ folderList })
  );
}

/**
 * we'll eventually have to do other stuff here like check for other ref files etc
 * d
 */
async function getRefComments() {
  return parseFile("./ref.comment.js");
}

/**
 * @function insertRef
 * This function inserts reference comments that are not included in the actual source file but instead in a separate
 * reference file and referenced by the source file so as to avoid clutter
 */
async function insertRef(parsedComments, i) {
  let refComments = await getRefComments();
  let refNo;
  // get the ref tag from the comment and find out what it is referencing
  parsedComments[i].tags.map(el => {
    if (el.tag == "ref") {
      refNo = el.name;
    }
  });
  /** using "el.name" (which is the reference number) find the comment that we want and
   *  get the properties we want off of the ref comment */
  let { tags, description, source } = refComments.find(el => {
    return (
      el.tags.findIndex(el => el.tag === "refNo" && el.name === refNo) !== -1
    );
  });
  /**
   * replace the properties of this comment with the right data, as if it were a normal
   * comment all along
   */
  parsedComments[i] = Object.assign(parsedComments[i], {
    tags,
    description,
    source
  });
  console.log(parsedComments[i].tags);
  return parsedComments;
}

function filterFiles(files) {
  return files.filter(
    file =>
      file.endsWith("html") ||
      file.endsWith(".doc.html") ||
      file.endsWith("docs") ||
      file.includes("node_modules") ||
      file.startsWith(".git")
  );
}
