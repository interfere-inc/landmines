export const fileReads = new Set([
  "access",
  "accessSync",
  "copyFile",
  "copyFileSync",
  "cp",
  "cpSync",
  "createReadStream",
  "existsSync",
  "glob",
  "globSync",
  "lstat",
  "lstatSync",
  "opendir",
  "opendirSync",
  "readFile",
  "readFileSync",
  "readdir",
  "readdirSync",
  "stat",
  "statSync",
]);

export const pathProducers = new Set([
  "resolve",
  "join",
  "dirname",
  "fileURLToPath",
  "URL",
  "String",
  "trim",
  "trimEnd",
  "toString",
]);

export const consumingParents = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "ParenthesizedExpression",
  "AwaitExpression",
  "TemplateLiteral",
]);

export const memberProducers = new Set([
  "pathname",
  "href",
  "trim",
  "trimEnd",
  "toString",
]);

export const writes = new Set([
  "appendFile",
  "appendFileSync",
  "mkdir",
  "mkdirSync",
  "mkdtemp",
  "mkdtempSync",
  "rm",
  "rmSync",
  "writeFile",
  "writeFileSync",
]);
