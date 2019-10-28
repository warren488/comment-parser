const parse = require('comment-parser');
const fs = require('fs');
const showdown = require('showdown');
const Handlebars = require('handlebars');
const { promisify } = require('util');

let parseFile = promisify(parse.file);

async function doStuff2(path) {
  if (path.endsWith('html')) {
    return;
  }
  let comments = [];
  let folderList = [];
  if (fs.lstatSync(path).isDirectory()) {
    let files = fs.readdirSync(path);
    let fileList = [];
    for (const file of files) {
      if (
        file.endsWith('html') ||
        file.endsWith('docs') ||
        file.includes('node_modules')
      ) {
        continue;
      }
      if (!fs.lstatSync(`${path}/` + file).isDirectory()) {
        fileList.push({ name: file, path: `${file}.html` });
        generateFile(path, file);
      } else {
        fileList.push({ name: file, path: `../${file}/docs` });
        doStuff2(`${path}/` + file);
      }
    } //forof files
    // console.log(fileList);
    generatefolderIndex(fileList, path);
  } else {
    console.log('called on file doind nothing');
  }
}
doStuff2('.');

function gethtmlForSnippet(md, lineStart, lang) {
  return `<code>
    <pre class="prettyprint lang-${lang} linenums:${lineStart + 1}">
${md}
    </pre>
  </code>`;
}

function getCSSAndLines(path, file) {
  let css = fs.readFileSync(`${path}/` + file).toString('utf8');
  /**
   * @ref 1
   */
  let cssLines = css.split('\n').map(el => el.trim());
  let cssLinesUntrimmed = css.split('\n');

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
  return cssLines[line].includes('*/');
}

/**
 * trim the string all the way up until the end of the current comment
 * @function getCodeAfterComment
 * */
function getCodeAfterComment(cssLinesUntrimmed, comment) {
  return cssLinesUntrimmed
    .slice(comment.line + 1, comment.line + 11)
    .join('\n');
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
  let endOfComment = getMultilineCommentEndLine(cssLines, parsedComment);
  // console.log(endOfComment);
  return cssLinesUntrimmed
    .slice(endOfComment + 1, endOfComment + 11)
    .join('\n');
}

function getMultilineCommentEndLine(cssLines, parsedComment) {
  /** @fixme noMatch for some reason this search will return null for some comments */
  // let lastLine =
  //   parsedComment.line + parsedComment.source.match(/\n/g).length + 1;
  /** some comments end differently */
  // let endLine =
  //   cssLines.indexOf('*/', parsedComment.line) > 0
  //     ? cssLines.indexOf('*/', parsedComment.line)
  //     : cssLines.indexOf('* */', parsedComment.line);
  let endLine = getCommentEndLine(parsedComment.line, cssLines);
  console.log(`${parsedComment.line} ends at: ${endLine}`);
  return endLine;
}
function getCommentEndLine(line, cssLines) {
  if (cssLines[line].includes('*/')) {
    return line;
  }
  let index = cssLines.findIndex(
    (el, index) => index >= line && el.includes('*/')
  );
  if (index !== -1) {
    return index;
  }
  return -1;
}

async function generateFile(path, file) {
  let comments = [];
  let language = file.split('.').pop();
  let { css, cssLines, cssLinesUntrimmed } = getCSSAndLines(path, file);
  await parseFile(`${path}/` + file).then(function(parsedComments) {
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
      if (parsedComments[i].tags.find(el => el.tag == 'ref') !== -1) {
        console.log('here', parsedComments[i].line);
        insertRef(parsedComments, i);
      }
      if (isOneLine(cssLines, parsedComments[i].line)) {
        let md = getCodeAfterComment(cssLinesUntrimmed, parsedComments[i]);
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
          getMultilineCommentEndLine(cssLines, parsedComments[i]) + 1,
          'scss'
        );
      }
    }
    comments.push(...parsedComments);
  });
  let template = fs.readFileSync(`./template.hbs`).toString('utf8');
  console.log(comments);

  fs.writeFileSync(
    `${path}/docs/${file}.html`,
    Handlebars.compile(template)({ comments })
  );
}

function generatefolderIndex(folderList, path) {
  let template = fs.readFileSync(`./folderList.hbs`).toString('utf8');
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
  return parseFile('./ref.comment.js');
}

async function insertRef(parsedComments, i) {
  let refComments = await getRefComments();
  let refNo;
  parsedComments[i].tags.map(el => {
    if (el.tag == 'ref') {
      refNo = el.name;
    }
  });
  /** get the properties we want off of the ref comment */
  let { tags, description, source } = refComments.find(el => {
    return el.tags.find(el => el.tag == 'ref') !== -1;
  });
  parsedComments[i] = Object.assign(parsedComments[i], {
    tags,
    description,
    source
  });
}
