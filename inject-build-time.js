const fs = require('fs');

// Get the current build time
const buildTime = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour12: false, // 24-hour format
});

// Replace the placeholder with the actual build time
fs.readFile('./index.html', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading HTML file:', err);
    return;
  }

  const updatedHTML = data.replace('BUILD_TIME_PLACEHOLDER', buildTime);

  fs.writeFile('./index.html', updatedHTML, 'utf8', (err) => {
    if (err) {
      console.error('Error writing updated HTML file:', err);
    } else {
      console.log('Build time successfully injected!');
    }
  });
});
