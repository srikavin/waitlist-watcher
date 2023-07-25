import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
    assetsInclude: ['**/sw.js'],
    plugins: [tsconfigPaths(), react()],
    build: {
        sourcemap: true
    }
})
