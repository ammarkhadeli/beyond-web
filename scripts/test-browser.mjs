// Set the URL inside Node: WSL does not forward arbitrary environment variables to Windows executables.
process.env.BASE_URL = process.argv[2] || 'http://127.0.0.1:5174';
process.argv = [process.argv[0],new URL('../node_modules/@playwright/test/cli.js',import.meta.url).pathname,'test',...process.argv.slice(3)];
await import('@playwright/test/cli');
