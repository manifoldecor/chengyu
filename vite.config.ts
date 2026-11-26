import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths so the game works from any address, including a GitHub Pages project site (https://name.github.io/repo/)
  base: './',
  build: { target: 'es2022' },
});
