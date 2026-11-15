import {defineConfig} from 'vite';

// The game has no cloud/model credentials. Do not load a previous Azure .env.
export default defineConfig({envDir: false});
