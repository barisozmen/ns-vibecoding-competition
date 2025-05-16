const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Only build in development mode
if (process.env.NODE_ENV !== 'production') {
  const { execSync } = require('child_process');
  console.log('Building the app...');
  execSync('npm run build');
}

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// For all routes, serve the index.html file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 