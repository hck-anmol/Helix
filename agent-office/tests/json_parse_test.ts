import assert from "assert";
import fs from "fs";

const jsonString1 = `
{
  "content": "#include <iostream>\\nint main() {\\n  return 0;\\n}"
}
`;

const parsed1 = JSON.parse(jsonString1);
console.log("Parsed 1 content:");
console.log(parsed1.content);

const jsonString2 = `
{
  "content": "std::cout << \\"\\\\n\\";"
}
`;

const parsed2 = JSON.parse(jsonString2);
console.log("Parsed 2 content:");
console.log(parsed2.content);
