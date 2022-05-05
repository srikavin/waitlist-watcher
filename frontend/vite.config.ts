import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

import replace from '@rollup/plugin-replace'
import {ManifestOptions, VitePWA, VitePWAOptions} from "vite-plugin-pwa";

const pwaOptions: Partial<VitePWAOptions> = {
    mode: 'development',
    base: '/',
    includeAssets: ['favicon.svg'],
    manifest: {
        name: 'PWA Router',
        short_name: 'PWA Router',
        theme_color: '#ffffff',
        icons: [
            {
                src: 'pwa-192x192.png', // <== don't add slash, for testing
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/pwa-512x512.png', // <== don't remove slash, for testing
                sizes: '512x512',
                type: 'image/png',
            },
            {
                src: 'pwa-512x512.png', // <== don't add slash, for testing
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable',
            },
        ],
    },
    devOptions: {
        enabled: process.env.SW_DEV === 'true',
        /* when using generateSW the PWA plugin will switch to classic */
        type: 'module',
        navigateFallback: 'index.html',
    },
}

const replaceOptions = {__DATE__: new Date().toISOString()}
const reload = process.env.RELOAD_SW === 'true'

if (process.env.SW === 'true') {
    pwaOptions.srcDir = 'src'
    pwaOptions.filename = 'sw-custom.ts'
    pwaOptions.strategies = 'injectManifest'
    ;(pwaOptions.manifest as Partial<ManifestOptions>).name = 'PWA Inject Manifest'
    ;(pwaOptions.manifest as Partial<ManifestOptions>).short_name = 'PWA Inject'
}

pwaOptions.registerType = 'autoUpdate'

if (reload) {
    // @ts-ignore
    replaceOptions.__RELOAD_SW__ = 'true'
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), VitePWA(pwaOptions), replace(replaceOptions)],
})
