const http = require("http");
const fs = require("fs");

const config = JSON.parse(fs.readFileSync("config.json"));
let appUrls = config.app_urls;

let counter = 0;

// Redirect incoming requests
const server = http.createServer((req, res) => {
  const targetUrl = new URL(appUrls[counter % appUrls.length]);
  counter++;

  let path = req.url.startsWith("/") ? req.url.slice(1) : req.url;

  res.statusCode = 302;
  res.setHeader("Location", targetUrl + path);
  res.end();
});

// Periodically check application health
setInterval(async () => {
  for (let i = 0; i < appUrls.length; i++) {
    try {
      const res = await fetch(appUrls[i] + "/health");

      if (res.status !== 200) {
        console.error(`Removing ${appUrls[i]} due to health check failure`);
        appUrls.splice(i, 1);
        i--; // Adjust index due to removal
      }
    } catch (err) {
      console.error(`Removing ${appUrls[i]} due to error: ${err.message}`);
      appUrls.splice(i, 1);
      i--; // Adjust index due to removal
    }
  }
}, 5000); // Check every 5 seconds

server.listen(3003, () => console.log("Load balancer listening on port 3003"));
