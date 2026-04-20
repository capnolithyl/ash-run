import { createServer } from "vite";

const root = process.cwd();

const server = await createServer({
  configFile: false,
  root,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});

await server.listen();
server.printUrls();

const shutdown = async () => {
  await server.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

