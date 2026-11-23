import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // 允许通过 TASKFLOW_API_TARGET 指向本地源码后端；默认仍为 8000
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react()],
    base: './',
    server: {
      port: 5173,
      proxy: {
        '/api': env.TASKFLOW_API_TARGET || 'http://127.0.0.1:8000',
      },
    },
    build: {
      outDir: 'dist',
      target: 'es2020',
    },
  }
})
