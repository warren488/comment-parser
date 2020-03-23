const parse = require("comment-parser");
const { promisify } = require("util");
let parseFile = promisify(parse.file);
const fs = require("fs");

class ParsedFile {
  constructor(filePath) {
    this.filePath = filePath;
  }
  async init() {
    await parseFile(this.filePath).then(parsedComments => {
      this.comments = parsedComments;
      this.rawCode = fs.readFileSync(this.filePath).toString("utf8");
      this.codeLines = this.rawCode.split("\n");
      this.trimmedCodeLines = this.rawCode.split("\n").map(el => el.trim());
      this.language = this.filePath.split(".").pop();
    });
  }
  getRefComments() {
    return parseFile("./ref.comment.js");
  }
  isOneLine(line) {
    /** here we look to see if the comment has a closing tag on the same line as its opening tag
     * to deremine if its a one liner but what happens is that the description returned will have no new
     * line chars in it which is how we determine how long the comment is
     */
    return this.trimmedCodeLines[line].includes("*/");
  }

  generateHTML() {
    for (let i = 0; i < this.comments.length; i++) {
      let code = this.getCodeAfterCommentForMultiLine(
        this.codeLines,
        this.comments[i]
      );
      this.comments.htmlSnippet = `<code>
      <pre class="prettyprint lang-${this.language} linenums:${this.comments[i]
        .line + 1}">
  ${code}
      </pre>
    </code>`;
    }
  }

  /** eventual merge the 2 methods below (multiline implementation should work for both) */
  getCodeAfterComment(comment) {
    /** find another way to get a reference to the comment from the comments property */
    return this.codeLines.slice(comment.line + 1, comment.line + 11).join("\n");
  }
  getCodeAfterCommentForMultiLine(codeLines, parsedComment, codeLinesUntrimmed) {
    let endOfComment = getCommentEndLine(codeLines, parsedComment);
    // console.log(endOfComment);
    return codeLinesUntrimmed
      .slice(endOfComment + 1, endOfComment + 11)
      .join("\n");
  }
  async insertRefs() {
    for (let i = 0; i < this.comments.length; i++) {
      let refComments = this.getRefComments();
      let refNum;
      if (this.comments[i].tags.findIndex(el => el.tag === "ref") !== -1) {
        refNum = el.name;
        /** find the ref comment that has this ref number and get these 3 properties off */
        let { tags, description, source } = refComments.find(el => {
          return (
            el.tags.findIndex(
              el => el.tag === "refNo" && el.name === refNum
            ) !== -1
          );
        });
        /** override the 3 given properties */
        this.comments[i] = Object.assign(this.comments[i], {
          tags,
          description,
          source
        });
        // this.comments[i] = await insertRef(this.comments, i);
      }
    }
  }
}

module.exports = ParsedFile;
