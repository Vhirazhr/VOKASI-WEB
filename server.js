const { createServer } = require('node:http');
const { parse } = require('node:url');
const next = require('next');

const dev = false;
const hostname = '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare()
  .then(() => {
    const server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url || '/', true);
        await handle(req, res, parsedUrl);
      } catch (error) {
        console.error('VOKASI request error:', error);
        if (!res.headersSent) res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });

    server.on('error', (error) => {
      console.error('VOKASI server startup error:', error);
      process.exit(1);
    });

    server.listen(port, () => {
      console.log(`VOKASI Next.js server listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start VOKASI:', error);
    process.exit(1);
  });
