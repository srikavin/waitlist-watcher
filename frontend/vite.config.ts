import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    assetsInclude: ['**/sw.js'],
    plugins: [react()],
    build: {
        sourcemap: true
    }
})
