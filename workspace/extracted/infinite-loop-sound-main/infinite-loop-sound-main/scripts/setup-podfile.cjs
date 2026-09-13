const fs = require("fs");
const lines = [
  'platform :ios, "16.0"',
  "use_frameworks! :linkage => :static",
  "",
  'target "App" do',
  '  pod "Capacitor", :path => "../../node_modules/@capacitor/ios"',
  "end",
  "",
];
fs.writeFileSync("ios/App/Podfile", lines.join("\n"));
console.log("Manual Podfile created");
