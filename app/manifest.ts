import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '南科實中行動應用',
    short_name: 'NK app',
    description: '南科實中學生專屬課表與生活工具，developing by muton',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#6B8E23',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}