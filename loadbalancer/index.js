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
  const targetPath = targetUrl + path;

  // Create an options object for the outgoing request
  const options = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetPath,
    method: req.method,
    headers: req.headers,
  };

  // Determine if we're using http or https
  const protocol = targetUrl.protocol === "https:" ? https : http;

  // Forward the request
  const proxy = protocol.request(options, function (targetRes) {
    // Pass through the status code and headers from the target application response
    res.writeHead(targetRes.statusCode, targetRes.headers);
    // Pipe the target application response into the incoming response
    targetRes.pipe(res, {
      end: true,
    });
  });

  // If there's an error, log it
  proxy.on("error", function (err) {
    console.log(err);
  });

  // Pipe the incoming request into the outgoing request
  req.pipe(proxy, {
    end: true,
  });
});

// The maximum number of retries for a health check
const maxRetries = 3;

// An object to keep track of retries for each URL
const retries = {};

// Periodically check application health
setInterval(async () => {
  for (let i = 0; i < appUrls.length; i++) {
    try {
      const res = await fetch(appUrls[i] + "/health");

      if (res.status !== 200) {
        console.log(res.status);
        // Increment retry counter
        retries[appUrls[i]] = (retries[appUrls[i]] || 0) + 1;
        console.error(
          `Health check failure for ${appUrls[i]}, retry ${retries[appUrls[i]]}`
        );

        // If the maximum number of retries has been reached, remove the URL
        if (retries[appUrls[i]] >= maxRetries) {
          console.error(`Removing ${appUrls[i]} due to health check failure`);
          delete retries[appUrls[i]]; // Reset the retry count
          appUrls.splice(i, 1);
          i--; // Adjust index due to removal
        }
      } else {
        // If the health check was successful, reset the retry counter for this URL
        delete retries[appUrls[i]];
      }
    } catch (err) {
      // Increment retry counter
      retries[appUrls[i]] = (retries[appUrls[i]] || 0) + 1;
      console.error(
        `Error for ${appUrls[i]}, retry ${retries[appUrls[i]]}: ${err.message}`
      );

      // If the maximum number of retries has been reached, remove the URL
      if (retries[appUrls[i]] >= maxRetries) {
        console.error(`Removing ${appUrls[i]} due to error: ${err.message}`);
        delete retries[appUrls[i]]; // Reset the retry count
        appUrls.splice(i, 1);
        i--; // Adjust index due to removal
      }
    }
  }
}, 5000); // Check every 5 seconds

server.listen(8080, () => console.log("Load balancer listening on port 8080"));
