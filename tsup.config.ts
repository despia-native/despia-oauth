import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    'vue/index': 'src/vue/index.ts',
    'svelte/index': 'src/svelte/index.ts',
    'web-components/index': 'src/web-components/auto-register.ts',
    'web-components/manual': 'src/web-components/index.ts',
    'providers/google': 'src/providers/google.ts',
    'providers/apple': 'src/providers/apple.ts',
    'providers/tiktok': 'src/providers/tiktok.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom', 'react-router-dom', 'vue', 'svelte'],
})
