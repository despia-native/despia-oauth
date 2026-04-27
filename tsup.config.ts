import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'web-components/index': 'src/web-components/auto-register.ts',
    'web-components/manual': 'src/web-components/index.ts',
    'server/apple-form-post': 'src/server/apple-form-post.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [],
})
