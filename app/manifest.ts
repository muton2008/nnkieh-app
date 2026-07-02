import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '南科實中行動應用',
    short_name: 'NK app',
    description: '南科實中學生專屬課表與生活工具，developing by muton',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAF8F5',
    theme_color: '#6B8E23',
    icons: [
      {
        src: '/NK-app-C/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/NK-app-C/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/NK-app-C/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}