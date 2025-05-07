const { build, context } = require("esbuild");

const args = process.argv.slice(2);
const isDev = args.length > 0 && args[0] === "dev";

const sharedConfig = {
  entryPoints: ["src/index.ts", "src/index.html", "src/common/styles/common.css", "src/site.css", "src/resources/*"],
  loader: {
    ".html": "copy",
    ".css": "copy",
    ".dat": "copy",
  },
  bundle: true,
  sourcemap: true,
  outdir: "dist",
  outbase: "src",
};

if (isDev) {
  serve();
} else {
  build({
    ...sharedConfig,
    minify: true,
  });
}

async function serve() {
  const ctx = await context(sharedConfig);
  let { hosts, port } = await ctx.serve({
    servedir: "dist",
  });

  hosts.forEach((host) => console.log(`Running at http://${host}:${port}`));
}
